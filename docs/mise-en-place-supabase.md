# Mise en place de Supabase (une seule fois, par Chris)

## 1. Projet

- Projet `cuspeed`, région **West EU (Paris)**, double authentification sur le compte.
- Options de sécurité à la création : « Automatically expose new tables » décoché, « Enable automatic RLS » coché.
- Mot de passe de la base rangé dans le gestionnaire de mots de passe.

## 2. Créer la structure (fait le 3 novembre 2026)

Appliqué au projet `Cuspeed` (région eu-west-3, Paris) avec le connecteur Supabase, avec l'accord de Chris :

1. `supabase/migrations/20261103000100_schema.sql`
2. `supabase/migrations/20261103000200_securite.sql`
3. `supabase/migrations/20261103000300_durcissement.sql` (corrections demandées par le Security Advisor)
4. Chargement initial (contenu de `supabase/seed.sql`) : 195 formations dont 160 `validee`, 37 organismes, 24 lieux, 95 sources, 472 pistes.

Contrôles faits : empreinte (md5) de chaque table identique à celle d'une base de référence chargée depuis `supabase/seed.sql` ; le rôle public ne voit que les 160 fiches validées ; Security Advisor sans alerte.

Pour un nouveau projet (test ou reprise), rejouer toutes les migrations de `supabase/migrations/` dans l'ordre de leur nom, puis `supabase/seed.sql`.

## 3. Donner un mot de passe aux rôles (jamais dans le dépôt)

Dans l'éditeur SQL, un rôle à la fois, avec un mot de passe long généré par le gestionnaire de mots de passe :

```sql
alter role agent_extracteur   with login password '...';
alter role agent_verificateur with login password '...';
alter role lecteur_sauvegarde with login password '...';
```

Chaque rôle se connecte ensuite avec l'adresse de connexion « Session pooler » du projet (Project Settings > Database), dont le nom d'utilisateur est `<rôle>.<identifiant du projet>`. Cette adresse complète est un secret :
- `lecteur_sauvegarde` : secret `CUSPEED_SAUVEGARDE_DB_URL`, rangé dans les environnements GitHub `sauvegarde` et `publication` (Settings → Environments, limités à `main`), jamais en secret de dépôt ;
- `agent_extracteur` et `agent_verificateur` : variable d'environnement `CUSPEED_DB_URL` de la session de chaque agent.

## 4. Vérifier que les droits tiennent

Lancer `supabase/tests/test_securite.py` sur une base de **test** (pas sur celle de production : le test refuse de se lancer contre Supabase). Il est exécuté automatiquement par GitHub à chaque pull request.

## 5. Plan

Le plan gratuit suffit pour construire. Avant le lancement public, passer à l'offre payante d'entrée de gamme et vérifier sur supabase.com/pricing ce qu'elle inclut (sauvegardes, absence de mise en pause).
