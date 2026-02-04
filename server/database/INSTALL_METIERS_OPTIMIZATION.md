# Instructions d'optimisation de la table metiers_france (230k entrées)

## Problème résolu
- Timeouts sur les recherches (ECONNABORTED après 8 secondes)
- 200010 résultats différents causant des erreurs
- Table volumineuse de 230k entrées nécessitant une optimisation

## Solution mise en place

### 1. Optimisations côté client (✅ Déjà appliqué)
- Timeout Axios augmenté à 25 secondes dans Niveau12.jsx
- Recherche minimum de 2 caractères

### 2. Optimisations côté serveur (✅ Déjà appliqué)
- Réduction des colonnes retournées (7 au lieu de 12)
- Filtrage temporel obligatoire (14-90 jours selon contexte)
- Suppression du fallback retry (source de lenteur)

### 3. Optimisations base de données (⚠️ À EXÉCUTER dans Supabase)

**IMPORTANT : Ces commandes SQL doivent être exécutées dans l'éditeur SQL de Supabase**

```sql
-- Copier-coller le contenu de rpc_search_metiers.sql dans l'éditeur SQL Supabase
```

#### Étapes d'installation :

1. **Se connecter à Supabase**
   - Aller sur https://supabase.com
   - Ouvrir votre projet ZeliaV2
   - Cliquer sur "SQL Editor" dans le menu gauche

2. **Exécuter le fichier SQL**
   - Ouvrir le fichier `rpc_search_metiers.sql`
   - Copier tout son contenu
   - Le coller dans l'éditeur SQL de Supabase
   - Cliquer sur "Run" ou appuyer sur Ctrl+Entrée

3. **Vérifier l'installation**
   ```sql
   -- Vérifier que les index sont créés
   SELECT indexname, indexdef 
   FROM pg_indexes 
   WHERE tablename = 'metiers_france';
   
   -- Vérifier que la fonction RPC existe
   SELECT routine_name, routine_type 
   FROM information_schema.routines 
   WHERE routine_name = 'search_metiers';
   ```

#### Index créés :
1. **idx_metiers_france_intitule_trgm** - Index GIN pour recherche ILIKE rapide
2. **idx_metiers_france_dateact_id** - Index composite pour tri optimisé
3. **idx_metiers_france_dateactualisation** - Index pour filtres temporels
4. **idx_metiers_france_typecontrat** - Index pour filtrer par type de contrat
5. **idx_metiers_france_alternance** - Index pour filtrer par alternance

#### Fonction RPC créée :
- **search_metiers()** - Recherche optimisée avec filtrage temporel automatique

### 4. Maintenance recommandée

Exécuter périodiquement (une fois par semaine) :
```sql
VACUUM ANALYZE metiers_france;
```

Cela met à jour les statistiques de la table pour que PostgreSQL choisisse toujours les meilleurs index.

## Performances attendues

Avant optimisation :
- ❌ Timeout après 8 secondes
- ❌ 200010 résultats renvoyés
- ❌ Scan complet de la table (230k lignes)

Après optimisation :
- ✅ Réponse en < 3 secondes
- ✅ Max 60 résultats par page
- ✅ Scan limité aux 14-90 derniers jours
- ✅ Utilisation d'index pour ILIKE et ORDER BY

## Tests à effectuer après installation

1. Dans Niveau12, taper une recherche courte (ex: "com")
2. Vérifier que les résultats arrivent en < 3 secondes
3. Vérifier qu'il y a maximum 60 résultats
4. Taper une recherche longue (ex: "développeur web")
5. Vérifier que les résultats sont pertinents et rapides

## Dépannage

Si les timeouts persistent :
1. Vérifier que les index sont bien créés (voir étape 3 de vérification)
2. Vérifier que la fonction search_metiers existe
3. Exécuter `VACUUM ANALYZE metiers_france;`
4. Vérifier les logs Supabase pour les erreurs PostgreSQL

Si aucun résultat n'apparaît :
1. Vérifier que la colonne `dateactualisation` contient des dates récentes
2. Ajuster les fenêtres temporelles dans rpc_search_metiers.sql si besoin
3. Tester avec des données plus anciennes en augmentant INTERVAL '90 days'
