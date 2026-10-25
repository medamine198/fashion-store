# Nova Studio

## Lancer la boutique

Depuis PowerShell, à la racine du projet, lancez :

```powershell
.\start_server.ps1
```

Choisissez un mot de passe administrateur d’au moins 12 caractères dans la fenêtre sécurisée. Le serveur affiche ensuite les adresses de la boutique et de l’administration. Pour arrêter le serveur, utilisez `Ctrl+C`.

## Données et synchronisation

La base SQLite est créée automatiquement dans `data/store.sqlite3` au premier démarrage. Les produits sont chargés depuis cette base par les deux interfaces. Les changements de catalogue sont répercutés en quelques secondes dans les pages ouvertes.

Faites une copie de `data/store.sqlite3` pour sauvegarder le catalogue. Les produits ne sont pas enregistrés dans le navigateur.

## À savoir

Le serveur écoute sur `127.0.0.1` : c’est une configuration de développement pour cet ordinateur. Pour publier la boutique en ligne ou l’ouvrir à d’autres appareils, il faudra l’héberger derrière HTTPS et utiliser une configuration serveur adaptée.
