#!/bin/sh
set -eu

# Crea el rol de aplicación sin privilegios de superusuario y los esquemas por módulo.
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_user="$APP_DB_USER" \
  --set=app_password="$APP_DB_PASSWORD" \
  --set=app_db="$POSTGRES_DB" <<-'EOSQL'
  SELECT format(
    'CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    :'app_user',
    :'app_password'
  )
  WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'app_user')
  \gexec

  SELECT format('GRANT CONNECT, CREATE ON DATABASE %I TO %I', :'app_db', :'app_user') \gexec

  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'app_user') \gexec

  SELECT format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', schema_name, :'app_user')
  FROM unnest(ARRAY[
    'shared',
    'access',
    'organizations',
    'people',
    'events',
    'attendance',
    'certificates',
    'inventory',
    'loans',
    'notifications',
    'reports',
    'pgboss'
  ]) AS schema_name
  \gexec
EOSQL
