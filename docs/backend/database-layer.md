# apps/api/src/database

The PostgreSQL boundary. Everything that talks to the database - the client
or ORM setup, entities/models, migrations, repositories - lives under here.

Nothing does yet. `DATABASE_URL` is validated at boot (`config/env.validation.ts`)
so the shape of the connection string is enforced from day one, but no
connection is opened and no ORM is installed in this phase.

Choosing an ORM (TypeORM, Prisma, Drizzle, or a plain `pg` client) is
explicitly out of scope for the Nx migration and tracked separately in
Post-Migration Recommendations - it is a real architectural decision, not a
byproduct of moving files around.
