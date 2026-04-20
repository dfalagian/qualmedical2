
ALTER TABLE public.cipi_requests
  DROP CONSTRAINT cipi_requests_quote_id_fkey,
  ADD CONSTRAINT cipi_requests_quote_id_fkey
    FOREIGN KEY (quote_id) REFERENCES public.quotes(id)
    ON DELETE SET NULL;
