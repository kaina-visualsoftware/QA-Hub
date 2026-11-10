-- Original pasted TF reports are not the short task description or file extracts.
-- Preserve full source text while retaining the existing parser limit for files.
begin;
alter table public.qa_requisito_fontes drop constraint if exists qa_requisito_fontes_texto_extraido_check;
alter table public.qa_requisito_fontes add constraint qa_requisito_fontes_texto_extraido_check
 check(tipo_fonte='texto' or char_length(texto_extraido)<=30000);
commit;
