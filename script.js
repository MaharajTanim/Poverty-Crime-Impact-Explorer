// Poverty & Crime Impact Explorer
// All processing is client-side. No external dependencies except Chart.js

let chartInstance = null;

const els = {
  file: document.getElementById("csvFile"),
  threshold: document.getElementById("threshold"),
  binSize: document.getElementById("binSize"),
  run: document.getElementById("runBtn"),
  reset: document.getElementById("resetBtn"),
  sample: document.getElementById("sampleBtn"),
  messages: document.getElementById("messages"),
  resultCards: document.getElementById("resultCards"),
  chartWrapper: document.querySelector(".chart-wrapper"),
  povertyRate: document.getElementById("povertyRate"),
  overallCrimeRate: document.getElementById("overallCrimeRate"),
  poorCrimeRate: document.getElementById("poorCrimeRate"),
  nonPoorCrimeRate: document.getElementById("nonPoorCrimeRate"),
  ksStat: document.getElementById("ksStat"),
  ksPValue: document.getElementById("ksPValue"),
  conclusion: document.getElementById("conclusion"),
  chartCanvas: document.getElementById("crimeChart"),
};

// Utility: format percentage
function fmtPct(x) {
  if (x == null || Number.isNaN(x)) return "-";
  return (x * 100).toFixed(2) + "%";
}
// Utility: format number
function fmtNum(x) {
  if (x == null || Number.isNaN(x)) return "-";
  return x.toLocaleString();
}

function setMessage(msg, isError = true) {
  els.messages.style.color = isError ? "var(--danger)" : "var(--primary)";
  els.messages.textContent = msg || "";
}

// Parse CSV (simple, robust enough for small files)
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) throw new Error("Empty file");
  const header = lines[0].split(",").map((h) => h.trim());
  const incomeIdx = header.findIndex((h) => h.toLowerCase() === "income");
  const crimeIdx = header.findIndex(
    (h) => h.toLowerCase() === "committed_crime"
  );
  if (incomeIdx === -1 || crimeIdx === -1) {
    throw new Error("Missing required columns 'income' and 'committed_crime'");
  }
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    if (row.length !== header.length) continue; // skip malformed line
    const income = parseFloat(row[incomeIdx]);
    const crime = parseFloat(row[crimeIdx]);
    if (Number.isFinite(income) && (crime === 0 || crime === 1)) {
      records.push({ income, crime });
    }
  }
  if (!records.length)
    throw new Error("No valid rows after parsing. Ensure crime is 0/1.");
  return records;
}

// KS test for two samples of Bernoulli indicators (crime). We treat arrays of crime values per group.
function ksTest(sampleA, sampleB) {
  // For binary data, the ECDF has at most two jumps (at 0 and 1). We can compute quickly.
  if (!sampleA.length || !sampleB.length) {
    return { statistic: NaN, pValue: NaN };
  }
  const countA1 = sampleA.reduce((a, v) => a + (v === 1 ? 1 : 0), 0);
  const countB1 = sampleB.reduce((a, v) => a + (v === 1 ? 1 : 0), 0);
  const pA = countA1 / sampleA.length; // P(crime=1)
  const pB = countB1 / sampleB.length;
  // Empirical CDF differences at 0 and 1 for binary variable X
  // F(x) = 0 for x < 0, = (1 - p) for 0 <= x < 1, = 1 for x >= 1
  const d0 = Math.abs(1 - pA - (1 - pB));
  const d1 = Math.abs(1 - 1); // always 0 at x >=1
  const d = Math.max(d0, d1);
  // Approximate p-value for two-sample KS.
  const n1 = sampleA.length,
    n2 = sampleB.length;
  const nEff = (n1 * n2) / (n1 + n2);
  const sqrtTerm = Math.sqrt(nEff) * d;
  // Asymptotic Kolmogorov distribution complementary CDF approximation
  // p ≈ 2 * sum_{j=1..∞} (-1)^{j-1} exp(-2 j^2 sqrtTerm^2)
  let p = 0;
  for (let j = 1; j <= 100; j++) {
    const term = Math.exp(-2 * j * j * sqrtTerm * sqrtTerm);
    p += (j % 2 === 1 ? 1 : -1) * term;
    if (term < 1e-8) break;
  }
  p = Math.min(Math.max(2 * p, 0), 1);
  return { statistic: d, pValue: p };
}

function computeMetrics(data, threshold, binSize) {
  const poor = [],
    nonPoor = [];
  for (const r of data) {
    if (r.income < threshold) poor.push(r);
    else nonPoor.push(r);
  }
  const total = data.length;
  const poorCrime = poor.reduce((a, r) => a + r.crime, 0);
  const nonPoorCrime = nonPoor.reduce((a, r) => a + r.crime, 0);
  const overallCrime = poorCrime + nonPoorCrime;

  const povertyRate = poor.length / total;
  const overallCrimeRate = overallCrime / total;
  const poorCrimeRate = poor.length ? poorCrime / poor.length : NaN;
  const nonPoorCrimeRate = nonPoor.length ? nonPoorCrime / nonPoor.length : NaN;

  const { statistic: ksStat, pValue: ksP } = ksTest(
    poor.map((r) => r.crime),
    nonPoor.map((r) => r.crime)
  );

  // Binning
  const binsMap = new Map();
  for (const r of data) {
    const binIndex = Math.floor(r.income / binSize);
    const binKey = binIndex * binSize; // lower bound
    let b = binsMap.get(binKey);
    if (!b) {
      b = { count: 0, crime: 0 };
      binsMap.set(binKey, b);
    }
    b.count += 1;
    b.crime += r.crime;
  }
  const bins = [...binsMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([low, agg]) => ({
      range: `${low}-${low + binSize - 1}`,
      rate: agg.crime / agg.count,
      count: agg.count,
    }));

  return {
    sampleSizes: { total, poor: poor.length, nonPoor: nonPoor.length },
    povertyRate,
    overallCrimeRate,
    poorCrimeRate,
    nonPoorCrimeRate,
    ksStat,
    ksP,
    bins,
  };
}

function updateResults(metrics) {
  els.povertyRate.textContent = fmtPct(metrics.povertyRate);
  els.overallCrimeRate.textContent = fmtPct(metrics.overallCrimeRate);
  els.poorCrimeRate.textContent = fmtPct(metrics.poorCrimeRate);
  els.nonPoorCrimeRate.textContent = fmtPct(metrics.nonPoorCrimeRate);
  els.ksStat.textContent =
    metrics.ksStat != null && !Number.isNaN(metrics.ksStat)
      ? metrics.ksStat.toFixed(4)
      : "-";
  els.ksPValue.textContent =
    metrics.ksP != null && !Number.isNaN(metrics.ksP)
      ? metrics.ksP.toExponential(3)
      : "-";
  let conclusion = "Insufficient data";
  if (!Number.isNaN(metrics.ksP)) {
    if (metrics.ksP < 0.05) conclusion = "Reject H0: Distributions differ";
    else conclusion = "Fail to reject H0: No significant difference";
  }
  els.conclusion.textContent = conclusion;
  els.resultCards.hidden = false;
}

function renderChart(metrics) {
  const labels = metrics.bins.map((b) => b.range);
  const rates = metrics.bins.map((b) => b.rate * 100);
  if (chartInstance) {
    chartInstance.destroy();
  }
  chartInstance = new Chart(els.chartCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Crime Rate (%)",
          data: rates,
          backgroundColor: "rgba(59,130,246,0.55)",
          borderColor: "rgba(59,130,246,1)",
          borderWidth: 1,
          hoverBackgroundColor: "rgba(59,130,246,0.75)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { maxRotation: 60, minRotation: 0, color: "#9da7b4" },
          grid: { color: "#2a313b" },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Crime Rate (%)" },
          ticks: { color: "#9da7b4" },
          grid: { color: "#2a313b" },
        },
      },
      plugins: {
        legend: { labels: { color: "#e6edf3" } },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.parsed.y.toFixed(2)}%` +
              ` (n=${fmtNum(metrics.bins[ctx.dataIndex].count)})`,
          },
        },
      },
    },
  });
  els.chartWrapper.hidden = false;
}

async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsText(file);
  });
}

async function runSimulation() {
  setMessage("");
  try {
    const threshold = parseFloat(els.threshold.value);
    const binSize = parseFloat(els.binSize.value);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      throw new Error("Enter a valid positive poverty threshold.");
    }
    if (!Number.isFinite(binSize) || binSize <= 0) {
      throw new Error("Enter a valid positive bin size.");
    }
    let file = els.file.files[0];
    if (!file) throw new Error("Upload a CSV file first.");
    const text = await readFileAsText(file);
    const data = parseCSV(text);
    if (data.length < 2)
      throw new Error("Not enough data rows to compute metrics.");
    const metrics = computeMetrics(data, threshold, binSize);
    updateResults(metrics);
    renderChart(metrics);
    setMessage("Simulation complete", false);
  } catch (err) {
    console.error(err);
    setMessage(err.message || "An error occurred.");
  }
}

function resetAll() {
  els.threshold.value = "";
  els.binSize.value = 5000;
  els.file.value = "";
  els.resultCards.hidden = true;
  els.chartWrapper.hidden = true;
  setMessage("");
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

function downloadSample() {
  // Generate a small synthetic sample dataset.
  const rows = ["income,committed_crime"];
  const rng = mulberry32(12345);
  for (let i = 0; i < 500; i++) {
    // incomes: mixture of low & high
    const income = Math.round(
      rng() < 0.5 ? rng() * 20000 : 20000 + rng() * 60000
    );
    // Probability of crime inversely correlated with income for demonstration
    const pCrime = Math.max(0.02, 0.25 - income / 100000);
    const crime = rng() < pCrime ? 1 : 0;
    rows.push(`${income},${crime}`);
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sample_poverty_crime.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Simple deterministic PRNG for sample data
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

els.run.addEventListener("click", runSimulation);
els.reset.addEventListener("click", resetAll);
els.sample.addEventListener("click", downloadSample);

// Re-run automatically if bin size changes and we already have results
els.binSize.addEventListener("change", () => {
  if (els.resultCards.hidden) return; // nothing yet
  runSimulation();
});
