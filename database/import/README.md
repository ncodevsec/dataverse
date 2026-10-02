# Legacy import folder

Place your legacy MySQL dump (`dataverse_db_*.sql`) and, optionally, the legacy
`img/profile/` photo folder here, then run `npm run db:import`.

Everything in this folder except this README is git-ignored on purpose:
the legacy data contains personal information (NID numbers, phone numbers,
photos) and must never be committed to a repository.
