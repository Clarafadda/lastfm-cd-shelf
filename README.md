# Ma rangée de CD

Une web app qui transforme les morceaux écoutés récemment sur [Last.fm](https://www.last.fm/) en une **rangée de boîtiers de CD en 3D**, vue en perspective. Chaque boîtier est un album, les plus récents sont devant, les plus anciens s'enfoncent dans la profondeur. Le morceau en cours d'écoute sort de la rangée.

## L'idée

Plutôt qu'une liste de pochettes, la profondeur représente le temps : plus un album a été écouté il y a longtemps, plus il est loin dans la rangée. On navigue dans le temps comme dans une étagère de CD, avec les boutons précédent / suivant, la molette, le glissement du doigt ou les flèches du clavier.

## Démarrer

**Prérequis**

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installé et lancé
- Un compte Last.fm avec des écoutes, et une clé API (gratuite) : <https://www.last.fm/api/account/create>

**Étapes**

```bash
git clone https://github.com/Clarafadda/lastfm-cd-shelf.git
cd lastfm-cd-shelf
docker compose up
```

Ouvre <http://localhost:8000>. Même sans fichier `.env`, l'application démarre : la page affiche alors un message t'invitant à configurer ta clé.

Pour afficher tes écoutes, copie le modèle et renseigne ta clé API et ton pseudo Last.fm :

```bash
cp .env.example .env
```

```
LASTFM_API_KEY=ta_cle_ici
LASTFM_USER=ton_pseudo_lastfm
CACHE_TTL_SECONDS=120
```

Puis relance avec `docker compose up` (ou `docker compose up -d --force-recreate` si le conteneur tourne déjà).

Pour arrêter : `Ctrl+C`, puis `docker compose down`.

## Configuration

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `LASTFM_API_KEY` | Clé API Last.fm (obligatoire, **secrète**) | — |
| `LASTFM_USER` | Pseudo Last.fm dont on affiche les écoutes (obligatoire) | — |
| `CACHE_TTL_SECONDS` | Durée de conservation des réponses de Last.fm | `120` |
| `HISTORY_SECONDS` | Fenêtre d'écoutes affichées | `86400` (24 h) |

## Comment ça marche

```
Navigateur  ──►  Serveur FastAPI  ──►  Last.fm
              (clé API, cache)
```

- **Le navigateur ne parle qu'à notre serveur.** Aucune requête ne part vers Last.fm depuis la page (à vérifier dans l'onglet Network).
- **La clé API reste sur le serveur**, dans une variable d'environnement lue depuis `.env`. Ce fichier est ignoré par Git et exclu de l'image Docker.
- **Cache** : le serveur garde la réponse de Last.fm `CACHE_TTL_SECONDS` secondes. Recharger la page plusieurs fois ne déclenche qu'un seul appel à Last.fm. Un verrou évite que des visiteurs simultanés déclenchent plusieurs appels.
- **Pochettes** : elles sont téléchargées et mises en cache par notre serveur (route `/api/cover`), qui n'accepte que les domaines d'images de Last.fm. Le navigateur ne contacte donc jamais le CDN de Last.fm.
- **Si Last.fm échoue** : le serveur renvoie les dernières données connues (la page l'indique), ou un message d'erreur clair si le cache est vide. La page n'est jamais blanche.
- **Affichage** : le front est du HTML, CSS et JavaScript sans bibliothèque. La 3D utilise les transformations CSS (`perspective`, `rotateX/Y`, `translateZ`). Les écoutes sont regroupées par album. Les textes sont insérés avec `textContent`, pour qu'un titre de morceau ne puisse pas injecter de HTML.
- **Responsive** : mise en page adaptée au laptop et au téléphone (boîtiers plus grands et rangée plus raide en portrait).

## Structure

```
app/main.py            Serveur FastAPI : /api/recent, /api/cover, cache, gestion d'erreur
static/index.html      Page
static/style.css       Scène 3D et mise en page
static/app.js          Rendu de la rangée, navigation, appels au serveur
Dockerfile             Image du serveur
docker-compose.yml     Lancement : `docker compose up`
.env.example           Modèle de configuration (sans secret)
```

## Vérifier les critères

- **Aucune requête vers Last.fm depuis le navigateur** : ouvrir les outils de développement, onglet Network, recharger : seules des requêtes vers `localhost` apparaissent.
- **Un seul appel pour deux rechargements** : recharger deux fois puis lancer `docker compose logs web` : une seule ligne « Appel à Last.fm ».
- **Last.fm injoignable** : mettre une fausse clé dans `.env`, relancer avec `docker compose up -d --force-recreate` : la page affiche un message.
- **Clé absente de l'historique Git** : `git log --all --oneline -S"$(grep '^LASTFM_API_KEY=' .env | cut -d= -f2)"` ne doit rien afficher.