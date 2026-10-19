
ALTER TABLE public.schools
  ADD COLUMN district text NOT NULL DEFAULT '',
  ADD COLUMN town text NOT NULL DEFAULT '',
  ADD COLUMN community text NOT NULL DEFAULT '',
  ADD COLUMN postal_address text NOT NULL DEFAULT '',
  ADD COLUMN gps_address text NOT NULL DEFAULT '';