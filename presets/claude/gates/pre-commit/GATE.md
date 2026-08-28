# Pre-commit Gate: Typecheck, Lint, and Test

Este gate instala un hook `pre-commit` que ejecuta `bun run typecheck`, `bun run lint` y `bun run test` antes de permitir commits en el repositorio. Si cualquiera de estos comandos falla, el commit es bloqueado.

## Cuándo usar

**Para agentes**: Integra este gate en flujos de desarrollo local cuando quieras garantizar que los cambios typecheck correctamente y pasan los tests antes de ser cometidos.

**Para equipos**: Utiliza este gate como barrera de calidad local (sin dependencias externas) para prevenir commits con errores de tipado o tests fallidos.

## Instalación

### Paso 1: Descarga el script

El script está embebido abajo (sección "Script Installer").

### Paso 2: Ejecuta en la raíz de tu proyecto

Desde la raíz del repositorio (o cualquier subdirectorio), extrae el bloque ```bash de este archivo y ejecuta:

    bash << 'SCRIPT_EOF'
    #!/bin/bash
    set -e
    # [contenido del bloque bash de abajo]
    SCRIPT_EOF

O, más simplemente, guarda el script en un archivo temporal y ejecútalo:

    curl -s https://raw.githubusercontent.com/.../ | bash

### Paso 3: Verifica

Después de la instalación, debería verse:

    Pre-commit hook installed successfully.

## Script Installer

```bash
#!/bin/bash
set -e

# Resolver git directory dinámicamente (worktree-safe)
GIT_DIR=$(git rev-parse --git-dir)
HOOK_PATH="$GIT_DIR/hooks/pre-commit"

# Detectar Husky o lint-staged en package.json
if grep -q '"husky"' package.json 2>/dev/null || grep -q '"lint-staged"' package.json 2>/dev/null; then
  echo "Warning: Husky or lint-staged detected in package.json. Installation skipped."
  exit 0
fi

# Verificar si un pre-commit hook ya existe
if [ -f "$HOOK_PATH" ]; then
  echo "Warning: Pre-commit hook already exists at $HOOK_PATH. Not overwriting."
  exit 0
fi

# Crear directorio hooks si no existe
mkdir -p "$GIT_DIR/hooks"

# Escribir el hook pre-commit
cat > "$HOOK_PATH" << 'HOOK_EOF'
#!/bin/bash
bun run typecheck || exit 1
bun run lint || exit 1
bun run test || exit 1
HOOK_EOF

# Hacer el hook ejecutable
chmod +x "$HOOK_PATH"

echo "Pre-commit hook installed successfully."
```

## Notas de implementación

- **Sin dependencias externas**: El script no instala Husky, lint-staged, ni ninguna otra herramienta. Solo escribe un archivo shell y configura permisos.
- **Resolución dinámica de git dir**: Usa `git rev-parse --git-dir` para localizar el directorio correcto, incluso en worktrees.
- **Detección de conflictos**: Si Husky o lint-staged ya está en `package.json`, el script avisa y no instala para evitar conflictos.
- **Protección de hooks existentes**: Si ya existe un `.git/hooks/pre-commit`, el script no lo sobrescribe.
- **Solo Bun**: El hook ejecuta `bun run typecheck`, `bun run lint` y `bun run test`. Asegúrate de que estos scripts están definidos en `package.json`.

## Verificación

Después de instalar, verifica que el hook está en su lugar.

Para verificar, ejecuta:

    ls -la .git/hooks/pre-commit

Debe mostrar algo como:

    -rwxr-xr-x  user  group  ... .git/hooks/pre-commit

Luego, intenta hacer un commit. Si hay errores de tipo o tests fallidos, el commit será bloqueado:

    git add .
    git commit -m "test"
    # Si typecheck o test falla, verás el error y el commit será abortado.

## Troubleshooting

### "Warning: Pre-commit hook already exists"

Ya hay un hook pre-commit. Revisa su contenido:

    cat .git/hooks/pre-commit

Si quieres reemplazarlo, bórralo y ejecuta el script nuevamente:

    rm .git/hooks/pre-commit
    bash /path/to/installer

### "Warning: Husky or lint-staged detected"

Tu proyecto usa Husky o lint-staged. Este gate no se instala para evitar conflictos. Si quieres usar este gate, remove Husky/lint-staged de `package.json` y ejecuta de nuevo.

### Hook no se ejecuta al hacer commit

Verifica que el hook es ejecutable:

    chmod +x .git/hooks/pre-commit

Verifica que `bun run typecheck`, `bun run lint` y `bun run test` existen en `package.json`:

    cat package.json | grep -A 5 '"scripts"'

### "command not found: bun"

Bun no está instalado o no está en PATH. Instala Bun desde https://bun.sh o configura PATH adecuadamente.

## Adicional: Desinstalación

Para remover el hook, simplemente bórralo:

    rm .git/hooks/pre-commit
