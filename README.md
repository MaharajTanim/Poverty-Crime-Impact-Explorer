# Poverty & Crime Impact Explorer

A fully client-side interactive web app to simulate and visualize the relationship between a poverty income threshold and observed crime rates.

## Features

- Upload CSV with columns: `income`, `committed_crime` (0/1).
- Set a poverty threshold (income < threshold => poor).
- Dynamic income bin size for aggregation (default 5000).
- Calculates:
  - Poverty rate
  - Overall crime rate
  - Crime rate among poor
  - Crime rate among non-poor
  - Two-sample Kolmogorov–Smirnov test statistic & p-value (poor vs non-poor crime indicator distributions)
- Interactive bar chart of crime rate (%) by income bin (Chart.js).
- Downloadable synthetic sample dataset.
- Accessible tooltips explaining statistical terms.
- Responsive dark-themed UI (CSS Grid/Flexbox).

## Getting Started

Just open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari). No build step required.

## Data Format

```
income,committed_crime
23000,0
18000,1
...
```

- `income`: numeric (integer or float)
- `committed_crime`: 0 or 1 (boolean indicator)

Invalid or malformed rows are skipped; if no valid rows remain, an error is shown.

## Statistical Notes

- Poverty classification: income < threshold (strict inequality, matching Python logic).
- Crime rates are simple proportions.
- KS Test: For binary data, the KS statistic reduces to the absolute difference in empirical CDF at value 0 (|pA - pB|). We compute an asymptotic p-value using the standard Kolmogorov distribution approximation.
- Interpretation card uses α = 0.05.

## Sample Data

Use the "Download Sample CSV" button for a synthetic dataset demonstrating an inverse relationship between income and crime probability.

## Extending

Potential enhancements:

- Add confidence intervals for rates (Wilson or Jeffreys intervals).
- Support multi-category crime severity.
- Add alternative tests (Chi-square for 2x2 table, logistic regression fit summary).

## License

MIT
