# React, Python, nginx and Postgres, run with Docker Compose

The app is a Vite React TypeScript frontend, a Python (FastAPI) API and a Postgres database, with nginx in front serving the UI and proxying `/api`, all run through Docker Compose. React with TypeScript (without Next.js), Python, Docker and nginx were fixed by Daniel because the project is also how he is learning them, so a single full-stack TypeScript app was ruled out even though it would be less to run. Postgres was chosen over SQLite because the app is meant to be hosted for several Users later.
