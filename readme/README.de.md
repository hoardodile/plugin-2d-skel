# 2D-Skel

Ein Live2D-, Spine- und DragonBones-Animationsviewer für hoardodile. Ein
Viewer rendert aus einer einzelnen Ressource animierte Charaktere in allen
drei Formaten:

- **Live2D** — offizielle Cubism-`*.model3.json`-Modelle und
  Live2DViewerEX-Konfigurationen (`model0.json` + `.moc3`/`.moc`,
  multivariant): Bewegungsgruppen, Ausdrücke, EX-Dialog/Auswahlmenüs,
  Sound, Hitboxen und Modellvarianten.
- **Spine** — direkte `.json`/`.skel` + `.atlas`-Exporte und
  Live2DViewerEX-`type: 9`-Konfigurationen (`model0.json` + `skeleton_N` +
  `atlases_*`): Animation/Skin/Overlay-Auswahl, EX-Hit-Test, Dialog,
  Sound, Modellvarianten.
- **DragonBones** — direkte `*_ske.json`/`*_dbbin` +
  `*_tex.json`-Atlas-Exporte und Live2DViewerEX-`type: 10`-Konfigurationen:
  Animation, Armature, Skin-Auswahl und Modellvarianten.

Der Viewer verteilt anhand des `engine` jeder Szene über einen
typsicheren Adapter; die gemeinsame Chrome (Szenenauswahl, Transport,
Dialog, Status) ist einmal geschrieben, engine-spezifische Bedienelemente
liegen hinter den engine-spezifischen Komponenten.

## Funktionen

- Erkennung für Cubism + Live2DViewerEX, Spine (direkt + EX) und
  DragonBones (direkt + EX); Bewegungsgruppen, Ausdrücke,
  EX-Dialog/Auswahlmenüs, Sound, Hitboxen und Modellvarianten je Engine.
- Transparenter/Schachbrett-Hintergrund, Schleife, Interaktion,
  Screenshot, Vollbild.
- Die proprietären Live2D-Laufzeiten werden **nicht mitgeliefert** — das
  erste Live2D-Modell lädt sie über einen gebündelten Download mit
  Zustimmung des Benutzers (sha256-verifiziert, im eigenen Vault). Spine
  und DragonBones nutzen gebündelte Laufzeiten.
- Ressourcen lassen sich im Suchfilter der Bibliothek nach Modellfamilie
  (Cubism / Standard / EX / DragonBones) filtern.

## Anforderungen

- hoardodile ≥ 0.1.8 (Details im README des Repositories).
- Vertraue dem Repository, bevor du es installierst — Plugin-Code läuft
  serverseitig in einer eingeschränkten Sandbox.
