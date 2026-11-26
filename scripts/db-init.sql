-- Runs once on first container start.
CREATE DATABASE shopsphere_test;
\connect shopsphere
CREATE EXTENSION IF NOT EXISTS pg_trgm;
\connect shopsphere_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
