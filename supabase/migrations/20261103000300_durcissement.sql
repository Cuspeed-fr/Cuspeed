-- Cuspeed : durcissement demandé par le contrôle de sécurité de Supabase (Security Advisor)

-- Chemin de recherche figé pour la fonction de date de modification
alter function public.maj_modifie_le() set search_path = public;

-- Fonction créée par Supabase pour activer la protection des lignes sur chaque nouvelle table
-- (option « Enable automatic RLS ») : elle n'a pas à être appelable depuis l'API publique.
-- Une fonction de déclencheur d'événement n'a pas besoin de ce droit pour fonctionner.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
