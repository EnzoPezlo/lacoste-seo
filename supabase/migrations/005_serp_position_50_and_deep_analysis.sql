-- Relax position constraint from 1-20 to 1-50
alter table serp_results drop constraint serp_results_position_check;
alter table serp_results add constraint serp_results_position_check check (position between 1 and 50);

-- Add new analysis type for deep dive
alter table analyses drop constraint analyses_analysis_type_check;
alter table analyses add constraint analyses_analysis_type_check
  check (analysis_type in ('lacoste_gap', 'position_movement', 'top3_deep_dive'));

-- Add opportunity score to analyses (1-10 scale)
alter table analyses add column if not exists opportunity_score integer
  check (opportunity_score between 1 and 10);
comment on column analyses.opportunity_score is 'Score 1-10 estimating how easy it is for Lacoste to gain positions on this keyword';
