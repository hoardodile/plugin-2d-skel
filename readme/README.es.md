# Animación 2D de esqueletos

Un visor de animaciones Live2D, Spine y DragonBones para hoardodile. Un
único visor renderiza, desde un solo recurso, personajes animados en los
tres formatos:

- **Live2D** — modelos oficiales Cubism `*.model3.json` y configuraciones
  de Live2DViewerEX (`model0.json` + `.moc3`/`.moc`, multivariante):
  grupos de movimiento, expresiones, menús de diálogo/elección EX, sonido,
  áreas de impacto y variantes de modelo.
- **Spine** — exportaciones directas `.json`/`.skel` + `.atlas` y
  configuraciones `type: 9` de Live2DViewerEX (`model0.json` + `skeleton_N`
  + `atlases_*`): selección de animación/piel/superposición, hit-testing EX,
  diálogo, sonido, variantes.
- **DragonBones** — exportaciones directas `*_ske.json`/`*_dbbin` +
  `*_tex.json` y configuraciones `type: 10` de Live2DViewerEX: animación,
  armadura, selección de piel y variantes.

El visor despacha según el `engine` de cada escena mediante un adaptador
tipado; el marco compartido (selector de escena, transporte, diálogo,
estado) se escribe una vez y los controles específicos de cada motor viven
tras los componentes por motor.

## Funciones

- Detección de Cubism + Live2DViewerEX, Spine (directo + EX) y DragonBones
  (directo + EX); grupos de movimiento, expresiones, menús EX, sonido,
  áreas de impacto y variantes por motor.
- Fondo transparente/cuadros, bucle, interactuar, captura, pantalla
  completa.
- Los runtimes propietarios de Live2D **no se distribuyen**: al abrir el
  primer modelo Live2D se descargan con un único consentimiento del usuario
  (sha256 fijado, guardados en el vault del plugin). Spine y DragonBones
  usan runtimes incluidos.
- Los recursos se pueden filtrar por familia de modelo (Cubism / Estándar /
  EX / DragonBones) en los filtros de búsqueda de la biblioteca.

## Requisitos

- hoardodile ≥ 0.1.6 (consulta el README del repositorio).
- Confía en el repositorio antes de instalarlo: el código del plugin se
  ejecuta en el servidor dentro de un sandbox restringido.
