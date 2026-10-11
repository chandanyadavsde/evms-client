# evms-client

Supervisor web app (React + Vite) and the **VMS Assist** Chrome plugin. API: **evms-server**.

## Web app

```
npm install
npm run dev                 # http://localhost:5180 — calls the API at http://localhost:4100
```

API elsewhere? `VMS_API_URL=https://api.example.com npm run dev`.

## Chrome plugin

```
npm run build:extension     # → extension/dist
```

Chrome → chrome://extensions → Developer mode → Load unpacked → `extension/dist`.
Alt+S copies an area of any page into VMS; Alt+P fills a portal form from a VMS job.

`packages/contracts` is a copy of the shared definitions in **evms-server** — keep both in step.
