-- Curated keywords from GSC data (top strategic queries per country)
-- Selected for: high impressions, product categories, competitive positions

-- Delete old test data
delete from keywords;

insert into keywords (keyword, category, countries, active) values
  -- === BOTH FR + US ===
  ('lacoste polo', 'Polos', '{FR,US}', true),
  ('lacoste sneakers', 'Shoes', '{FR,US}', true),
  ('lacoste bracelet', 'Accessories', '{FR,US}', true),
  ('lacoste bag', 'Bags', '{FR,US}', true),
  ('lacoste perfume', 'Fragrance', '{FR,US}', true),
  ('lacoste jacket', 'Outerwear', '{FR,US}', true),
  ('lacoste watch', 'Accessories', '{FR,US}', true),
  ('lacoste tracksuit', 'Sportswear', '{FR,US}', true),

  -- === FR only (French queries) ===
  ('sacoche lacoste', 'Bags', '{FR}', true),
  ('sac lacoste', 'Bags', '{FR}', true),
  ('basket lacoste femme', 'Shoes', '{FR}', true),
  ('basket lacoste homme', 'Shoes', '{FR}', true),
  ('survetement lacoste', 'Sportswear', '{FR}', true),
  ('pull lacoste', 'Knitwear', '{FR}', true),
  ('doudoune lacoste', 'Outerwear', '{FR}', true),
  ('bonnet lacoste', 'Accessories', '{FR}', true),
  ('casquette lacoste', 'Accessories', '{FR}', true),
  ('montre lacoste', 'Accessories', '{FR}', true),
  ('parfum lacoste', 'Fragrance', '{FR}', true),
  ('polo lacoste homme', 'Polos', '{FR}', true),
  ('ensemble lacoste', 'Sportswear', '{FR}', true),
  ('chaussure lacoste', 'Shoes', '{FR}', true),
  ('sacoche homme', 'Bags', '{FR}', true),
  ('veste lacoste', 'Outerwear', '{FR}', true),
  ('t shirt lacoste', 'T-Shirts', '{FR}', true),

  -- === US only (English queries) ===
  ('lacoste shoes', 'Shoes', '{US}', true),
  ('lacoste polo shirt', 'Polos', '{US}', true),
  ('lacoste tote bag', 'Bags', '{US}', true),
  ('lacoste slides', 'Shoes', '{US}', true),
  ('lacoste t shirt', 'T-Shirts', '{US}', true),
  ('lacoste wallet', 'Accessories', '{US}', true),
  ('lacoste hoodie', 'Sportswear', '{US}', true),
  ('lacoste cap', 'Accessories', '{US}', true),
  ('lacoste sweater', 'Knitwear', '{US}', true),
  ('lacoste cologne', 'Fragrance', '{US}', true),
  ('lacoste quarter zip', 'Knitwear', '{US}', true),
  ('lacoste belt', 'Accessories', '{US}', true),
  ('lacoste sunglasses', 'Accessories', '{US}', true),
  ('lacoste backpack', 'Bags', '{US}', true),
  ('lacoste tennis', 'Sports', '{US}', true),
  ('lacoste shirts', 'Shirts', '{US}', true),
  ('lacoste sale', 'Commercial', '{US}', true);
