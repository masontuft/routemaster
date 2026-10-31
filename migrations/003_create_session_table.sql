-- Table used by connect-pg-simple (copied from its table.sql, without the deprecated OIDS option).
CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL COLLATE "default",
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL
);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");

CREATE INDEX "IDX_session_expire" ON "session" ("expire");
