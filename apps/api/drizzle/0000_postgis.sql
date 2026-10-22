-- First migration: PostGIS must exist before any geometry column.
CREATE EXTENSION IF NOT EXISTS postgis;
