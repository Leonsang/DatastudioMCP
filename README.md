# DatastudioMCP

Herramientas para crear, migrar y depurar informes de **Data Studio / Looker Studio** como código. Funcionan sobre el editor real por CDP, sin capturas ni clics.

| Carpeta | Contenido |
|---|---|
| [`looker-studio-mcp/`](looker-studio-mcp/README.md) | Servidor MCP y CLI `ls-studio` (TypeScript, puppeteer-core): layout, campos, diagnóstico, export, creación de componentes, spec declarativo y aprendizaje en `knowledge/` |
| [`LOOKER_STUDIO_INTERNALS.md`](LOOKER_STUDIO_INTERNALS.md) | Ingeniería inversa del editor: puntos de entrada estables, formato de guardado y mecanismo de creación desde JSON |
| [`skills/`](skills/README.md) | Guías de buenas prácticas (diseño, KPIs, rendimiento, modelo de datos, migración, depuración), con fuentes |
| [`dataset/`](dataset/generar_dataset.py) | Generador del Google Sheet de prueba, que cubre todos los tipos de campo y gráfico |

Inicio rápido:

```bash
cd looker-studio-mcp && npm install && npm run build
msedge --remote-debugging-port=9222 --user-data-dir=%LOCALAPPDATA%\EdgeCDP   # iniciar sesión una vez
node dist/cli.js open "https://datastudio.google.com/reporting/<id>/edit"
node dist/cli.js diagnose
node dist/cli.js apply examples/resumen.spec.json --dry-run
```

> Interfaz no oficial: usa APIs internas del editor. Trabaja siempre sobre copias de los informes.
