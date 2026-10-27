# FileFlow

Gestionnaire intelligent de fichiers PDF, pensé comme une arène de jeu vidéo : on fusionne, on tranche, on extrait et on réorganise des pages en voyant chaque geste se produire.

## Les quatre missions

| Mission | Ce que voit l'utilisateur |
| --- | --- |
| Fusion | Chaque PDF déposé s'envole du portail jusqu'à la chaîne de documents, puis tous sont aspirés par le noyau de fusion. |
| Découpe | Un clic entre deux pages passe le sabre laser : les tranches se colorent et se détachent. Sortie en archive ZIP. |
| Extraction | Les pages sont verrouillées par un réticule (clic ou glissement de souris, ou plage « 1-3, 5, 8- »), puis partent dans la soute. |
| Réorganisation | Glisser-déposer en direct : les autres pages s'écartent pour faire de la place. Flèches disponibles pour le tactile et le clavier. |

Chaque mission rapporte de l'expérience (niveaux et grades), avec sons synthétisés, particules et fond 3D. Le rem est fluide : l'interface s'adapte du portable à la 4K. Les animations respectent `prefers-reduced-motion`. Le téléchargement du résultat ne demande aucun compte.

## Technologies

- API : Python, FastAPI, pypdf (`api/index.py`)
- Interface : Vue 3 et Vite, pdf.js pour les miniatures (`frontend/`)
- Hébergement : Vercel (front et API)
- Plus tard : PostgreSQL pour les comptes, l'historique et les abonnements

## Lancer en local

```bash
# 1. API (port 8000)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn api.index:app --reload --port 8000

# 2. Interface (port 5173, les appels /api sont relayés vers l'API)
cd frontend
npm install
npm run dev
```

Documentation interactive de l'API : http://127.0.0.1:8000/api/docs

## Tests

```bash
pytest
```

## API

| Route | Entrée | Sortie |
| --- | --- | --- |
| `GET /api/health` | aucune | état et limites du serveur |
| `POST /api/info` | `file` | nombre de pages et taille |
| `POST /api/merge` | `files` (2 fichiers ou plus, dans l'ordre voulu) | un PDF |
| `POST /api/extract` | `file`, `pages` (ex : `1-3,5,8-`) | un PDF |
| `POST /api/reorder` | `file`, `order` (ex : `3,1,2`) | un PDF |
| `POST /api/split` | `file`, `ranges` (ex : `1-3,4-6`) ou `every` (pages par fichier) | une archive ZIP |

Les erreurs sont renvoyées en français (`detail`) avec le code 413 pour un fichier trop gros et 422 pour une demande invalide ou un PDF illisible, protégé ou corrompu. L'API ne conserve rien : chaque requête est traitée puis oubliée.

## Déploiement sur Vercel

1. Importer le dépôt dans Vercel, sans rien changer : `vercel.json` définit la compilation du front et la redirection de `/api/*` vers la fonction Python.
2. Variables facultatives : `MAX_UPLOAD_MB` (4 par défaut), `MAX_FILES` (20), `MAX_PARTS` (200), `ALLOWED_ORIGINS` (`*`).

Important : Vercel limite le corps d'une requête à environ 4,5 Mo. La limite par défaut de 4 Mo reste donc en dessous, et l'interface prévient avant l'envoi. Pour de plus gros fichiers, il faudra héberger l'API ailleurs (le front lit `VITE_API_URL`) ou passer par un stockage temporaire.

## Structure

```
api/index.py          API FastAPI
tests/                tests pytest
frontend/src/
  App.vue             HUD, XP, barre de missions, écran d'accueil
  views/                les 4 missions
  components/         fond 3D, particules, portail de dépôt, miniatures, victoire
  lib/                  état, sons, particules, pdf.js, client API
vercel.json           build et réécritures
```

## Pistes pour la suite

Comptes et historique (PostgreSQL), abonnements, rotation et suppression de pages, traitement dans le navigateur pour dépasser la limite de 4 Mo.
