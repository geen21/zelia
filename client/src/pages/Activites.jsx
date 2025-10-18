import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import api, { usersAPI } from '../lib/api';
import { ALL_QUEST_IDS, MAX_LEVEL, XP_PER_LEVEL, questLabel } from '../lib/progression';

// Zélia Game Engine - French Career Orientation Game
class ZeliaGameEngine {
    constructor(seed = 'zelia') {
        this.levelThreshold = (level) => {
            const cleanLevel = Math.max(1, Math.floor(level));
            if (cleanLevel >= MAX_LEVEL + 1) {
                return MAX_LEVEL * XP_PER_LEVEL;
            }
            return Math.max(0, (cleanLevel - 1) * XP_PER_LEVEL);
        };
        this.seed = String(seed || 'zelia');
    }

    setSeed(seed) {
        this.seed = String(seed || 'zelia');
    }

    processEvent(currentState, event) {
        let newState = { ...currentState };
        let xpGained = 0;
        let questsCompleted = [];

        // Process event and award XP
        switch (event.type) {
            case 'micro_action':
                xpGained = Math.random() > 0.5 ? 3 : 5;
                break;
            case 'quiz_completed':
                xpGained = 35;
                if (event.questId) questsCompleted.push(event.questId);
                break;
            case 'mission_completed':
                xpGained = 65;
                questsCompleted.push(event.questId);
                break;
            case 'meeting_completed':
                xpGained = 120;
                questsCompleted.push(event.questId);
                break;
            case 'parcoursup_milestone':
                xpGained = 200;
                questsCompleted.push(event.questId);
                break;
            case 'video_watched':
                xpGained = 15;
                break;
        }

        // Update XP and level
        newState.progression.xp += xpGained;
        const newLevel = this.calculateLevel(newState.progression.xp);
        const leveledUp = newLevel > newState.progression.level;
        newState.progression.level = newLevel;
    const rawToNext = this.levelThreshold(newLevel + 1) - newState.progression.xp;
    newState.progression.toNext = newLevel >= MAX_LEVEL ? 0 : rawToNext > 0 ? rawToNext : XP_PER_LEVEL;

        // Merge quests just completed
        const existingQuests = Array.isArray(newState.quests) ? newState.quests : [];
        const mergedQuests = [...existingQuests, ...questsCompleted].filter(Boolean);
        newState.quests = Array.from(new Set(mergedQuests));

        // Generate response
        const response = this.generateResponse(newState, event, xpGained, leveledUp, questsCompleted);
        // Persist newly unlocked perks into state as well
        if (response && Array.isArray(response.perks)) {
            const existingPerks = Array.isArray(newState.perks) ? newState.perks : [];
            newState.perks = Array.from(new Set([...existingPerks, ...response.perks]));
        }
        
        return { newState, response };
    }

    calculateLevel(xp) {
        let level = 1;
        while (xp >= this.levelThreshold(level + 1) && level < MAX_LEVEL) {
            level++;
        }
        return level;
    }

    generateResponse(state, event, xpGained, leveledUp, questsCompleted) {
        const level = state.progression.level;
        const arc = this.getArc(level);
        
        let emotion = 'calm';
        let speak = '';
        let suggestedActions = [];
        let newPerks = [];

        if (leveledUp) {
            emotion = 'celebratory';
            speak = `Bravo ! Tu passes au niveau ${level} ! `;
            newPerks = this.unlockPerks(level);
        }

        // Generate contextual dialogue and actions based on arc
        switch (arc) {
            case 'exploration':
                if (!speak) speak = 'Commençons ton aventure d\'orientation ! ';
                speak += 'Explorons tes premiers intérêts ensemble.';
                emotion = emotion === 'calm' ? 'encouraging' : emotion;
                suggestedActions = [
                    { id: 'complete_test', type: 'quiz_completed', label: 'Compléter le test d\'orientation', xp: 35 },
                    { id: 'explore_interests', type: 'micro_action', label: 'Explorer mes centres d\'intérêt', xp: 5 },
                    { id: 'watch_intro', type: 'video_watched', label: 'Regarder la vidéo d\'introduction', xp: 15 }
                ];
                break;
                
            case 'interets_forces':
                if (!speak) speak = 'Maintenant, approfondissons tes forces ! ';
                speak += 'Quels sont tes talents cachés ?';
                emotion = emotion === 'calm' ? 'thinking' : emotion;
                suggestedActions = [
                    { id: 'strengths_quiz', type: 'quiz_completed', label: 'Quiz sur tes forces', xp: 40 },
                    { id: 'personality_test', type: 'mission_completed', label: 'Test de personnalité approfondi', xp: 60 },
                    { id: 'values_exploration', type: 'micro_action', label: 'Définir tes valeurs', xp: 8 }
                ];
                break;
                
            case 'recherche_metiers':
                if (!speak) speak = 'Place à la découverte des métiers ! ';
                speak += 'Quels univers professionnels t\'attirent ?';
                emotion = emotion === 'calm' ? 'focused' : emotion;
                suggestedActions = [
                    { id: 'job_research', type: 'mission_completed', label: 'Rechercher 5 métiers correspondants', xp: 70 },
                    { id: 'salary_analysis', type: 'micro_action', label: 'Analyser les salaires', xp: 10 },
                    { id: 'job_videos', type: 'video_watched', label: 'Vidéos métiers recommandés', xp: 20 }
                ];
                break;
                
            case 'immersions_rencontres':
                if (!speak) speak = 'Temps de rencontrer des professionnels ! ';
                speak += 'Prêt(e) pour des échanges inspirants ?';
                emotion = emotion === 'calm' ? 'excited' : emotion;
                suggestedActions = [
                    { id: 'schedule_meeting', type: 'meeting_completed', label: 'Planifier un entretien professionnel', xp: 120 },
                    { id: 'prepare_questions', type: 'mission_completed', label: 'Préparer tes questions', xp: 50 },
                    { id: 'company_visit', type: 'meeting_completed', label: 'Visite d\'entreprise virtuelle', xp: 100 }
                ];
                break;
                
            case 'competences_soft_skills':
                if (!speak) speak = 'Développons tes compétences ! ';
                speak += 'Montrons ce dont tu es capable.';
                emotion = emotion === 'calm' ? 'proud' : emotion;
                suggestedActions = [
                    { id: 'soft_skills_assessment', type: 'mission_completed', label: 'Évaluation des soft skills', xp: 80 },
                    { id: 'star_method', type: 'quiz_completed', label: 'Méthode STAR pour tes expériences', xp: 45 },
                    { id: 'leadership_test', type: 'micro_action', label: 'Test de leadership', xp: 12 }
                ];
                break;
                
            case 'cv_lm':
                if (!speak) speak = 'Créons ton CV et ta lettre ! ';
                speak += 'Premier pas vers Parcoursup.';
                emotion = emotion === 'calm' ? 'focused' : emotion;
                suggestedActions = [
                    { id: 'cv_builder', type: 'mission_completed', label: 'Générateur de CV guidé', xp: 90 },
                    { id: 'cover_letter', type: 'mission_completed', label: 'Rédiger ta lettre de motivation', xp: 85 },
                    { id: 'cv_review', type: 'micro_action', label: 'Révision et amélioration', xp: 15 }
                ];
                break;
                
            case 'parcoursup_preparation':
                if (!speak) speak = 'Direction Parcoursup ! ';
                speak += 'Préparons ton dossier d\'excellence.';
                emotion = emotion === 'calm' ? 'thinking' : emotion;
                suggestedActions = [
                    { id: 'projet_motive', type: 'parcoursup_milestone', label: 'Rédiger ton projet motivé', xp: 200 },
                    { id: 'voeux_strategy', type: 'mission_completed', label: 'Stratégie de vœux', xp: 120 },
                    { id: 'calendar_planning', type: 'micro_action', label: 'Planifier ton calendrier', xp: 20 }
                ];
                break;
                
            case 'orals_pitch':
                if (!speak) speak = 'Préparons tes oraux ! ';
                speak += 'Tu vas briller lors des entretiens.';
                emotion = emotion === 'calm' ? 'encouraging' : emotion;
                suggestedActions = [
                    { id: 'pitch_practice', type: 'mission_completed', label: 'Entraînement pitch 60 secondes', xp: 100 },
                    { id: 'interview_simulation', type: 'meeting_completed', label: 'Simulation d\'entretien avec Zélia', xp: 150 },
                    { id: 'confidence_building', type: 'quiz_completed', label: 'Exercices de confiance', xp: 40 }
                ];
                break;
                
            case 'dossiers_avances':
                if (!speak) speak = 'Perfectionnons tout ! ';
                speak += 'Ton dossier sera exceptionnel.';
                emotion = emotion === 'calm' ? 'proud' : emotion;
                suggestedActions = [
                    { id: 'portfolio_review', type: 'parcoursup_milestone', label: 'Révision complète du portfolio', xp: 180 },
                    { id: 'coherence_check', type: 'mission_completed', label: 'Vérification de cohérence', xp: 90 },
                    { id: 'final_polish', type: 'micro_action', label: 'Finitions et optimisations', xp: 25 }
                ];
                break;
                
            case 'maitrise_finale':
                if (!speak) speak = 'Tu es maintenant expert(e) ! ';
                speak += 'Accompagne d\'autres dans leur parcours.';
                emotion = emotion === 'calm' ? 'celebratory' : emotion;
                suggestedActions = [
                    { id: 'mentor_others', type: 'meeting_completed', label: 'Mentorat d\'autres utilisateurs', xp: 200 },
                    { id: 'success_story', type: 'mission_completed', label: 'Partager ton histoire', xp: 150 },
                    { id: 'expert_badge', type: 'parcoursup_milestone', label: 'Obtenir le badge expert', xp: 250 }
                ];
                break;
        }

        const avatar = this.generateAvatar(emotion);

        return {
            progression: state.progression,
            ui: { speak },
            suggestedActions,
            avatar,
            perks: newPerks,
            xpGained
        };
    }

    getArc(level) {
        if (level <= 5) return 'exploration';
        if (level <= 10) return 'interets_forces';
        if (level <= 15) return 'recherche_metiers';
        if (level <= 20) return 'immersions_rencontres';
        if (level <= 25) return 'competences_soft_skills';
        if (level <= 30) return 'cv_lm';
        if (level <= 35) return 'parcoursup_preparation';
        if (level <= 40) return 'orals_pitch';
        if (level <= 45) return 'dossiers_avances';
        return 'maitrise_finale';
    }

    unlockPerks(level) {
        const perks = [];
        if (level === 5) perks.push('Checklist intelligente débloquée');
        if (level === 10) perks.push('Générateur de CV disponible');
        if (level === 15) perks.push('Bibliothèque d\'exemples débloquée');
        if (level === 20) perks.push('Conseils personnalisés activés');
        if (level === 25) perks.push('Simulateur de cohérence disponible');
        if (level === 30) perks.push('Alertes calendrier activées');
        if (level === 35) perks.push('Coaching express débloqué');
        if (level === 40) perks.push('Révisions STAR disponibles');
        if (level === 45) perks.push('Mode mentor activé');
        if (level === 50) perks.push('Maître Zélia - Badge ultime !');
        return perks;
    }

    generateAvatar(emotion) {
        // Deterministic color pick from seed to avoid changing avatar URL on every render
        const BG = ['ffdfbf', 'ffeaa7', 'd63031', 'fd79a8'];
        const seedStr = `${this.seed}-${emotion || 'calm'}`;
        const hash = Array.from(seedStr).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0);
        const bgColor = BG[hash % BG.length];

        const baseParams = {
            size: '200',
            radius: '15',
            backgroundColor: bgColor,
            skinColor: 'fdbcb4',
            hairColor: '4a4a4a',
            eyesColor: '000000',
            seed: this.seed
        };

        const emotionParams = {
            happy: { mouth: 'happy12', glassesProbability: '0', frecklesProbability: '0' },
            excited: { mouth: 'happy17', hairAccessories: 'flowers', hairAccessoriesProbability: '60', eyesColor: '000000' },
            calm: { mouth: 'happy04', frecklesProbability: '10' },
            focused: { mouth: 'happy03', glasses: 'variant03', glassesProbability: '100' },
            thinking: { mouth: 'sad03', glasses: 'variant02', glassesProbability: '60' },
            proud: { mouth: 'happy15', head: 'variant02', hairAccessories: 'flowers', hairAccessoriesProbability: '40' },
            confused: { mouth: 'sad05', glassesProbability: '0', frecklesProbability: '20' },
            encouraging: { mouth: 'happy10', eyesColor: '000000' },
            celebratory: { mouth: 'happy18', hairAccessories: 'flowers', hairAccessoriesProbability: '80' }
        };

        const params = { ...baseParams, ...emotionParams[emotion] };
        const paramString = Object.entries(params).map(([key, value]) => `${key}=${value}`).join('&');
        
        return {
            dicebear: `https://api.dicebear.com/9.x/lorelei/svg?${paramString}`,
            emotion: emotion
        };
    }
}

// Prefer the stored avatar from profiles over generated ones
function buildAvatarFromProfile(profile, fallbackAvatar, seed = 'zelia') {
    try {
        // Direct URL stored
        if (profile?.avatar && typeof profile.avatar === 'string') {
            return { dicebear: profile.avatar, emotion: fallbackAvatar?.emotion || 'calm' };
        }
        // JSON config with dicebear parameters
        if (profile?.avatar_json) {
            let conf = profile.avatar_json;
            if (typeof conf === 'string') {
                try { conf = JSON.parse(conf); } catch {}
            }
            if (conf && typeof conf === 'object') {
                const params = new URLSearchParams();
                params.set('seed', String(seed));
                Object.entries(conf).forEach(([k, v]) => {
                    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
                });
                if (!params.has('size')) params.set('size', '200');
                return {
                    dicebear: `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`,
                    emotion: fallbackAvatar?.emotion || 'calm'
                };
            }
        }
    } catch {}
    return fallbackAvatar || { dicebear: '', emotion: 'calm' };
}

// Libellés localisés pour les types d'actions
const TYPE_LABELS_FR = {
    micro_action: 'micro action',
    video_watched: 'vidéo regardée',
    quiz_completed: 'quiz complété',
    mission_completed: 'mission complétée',
    meeting_completed: 'entretien complété',
    parcoursup_milestone: 'jalon Parcoursup',
}
function typeLabelFR(t) {
    return TYPE_LABELS_FR[t] || String(t || '').replace('_', ' ')
}

const Activites = () => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [inscriptionDone, setInscriptionDone] = useState(false);
    const [gameState, setGameState] = useState(null);
    const [gameEngine] = useState(new ZeliaGameEngine());
    const [lastResponse, setLastResponse] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        let isMounted = true;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { navigate('/login'); return; }
            if (!isMounted) return;
            setUser(user);
            try { gameEngine.setSeed(user.id); } catch {}

            // Fetch profile + progression in parallel
            try {
                const [profRes, progRes] = await Promise.all([
                    usersAPI.getProfile().catch(() => null),
                    api.get(`/progression/${user.id}`).catch(() => null)
                ]);

                const prof = profRes?.data?.profile || null;
                if (isMounted) setProfile(prof);

                const pdata = progRes?.data || {};
                const cleanLevel = Math.max(1, Math.min(Math.floor(pdata?.level) || 1, MAX_LEVEL));
                const baseXpForLevel = Math.max(0, (cleanLevel - 1) * XP_PER_LEVEL);
                const rawXp = Number(pdata?.xp);
                const cleanXp = Number.isFinite(rawXp)
                    ? Math.min(Math.max(rawXp, baseXpForLevel), Math.min(baseXpForLevel + XP_PER_LEVEL, MAX_LEVEL * XP_PER_LEVEL))
                    : baseXpForLevel;
                const rawToNext = gameEngine.levelThreshold(cleanLevel + 1) - cleanXp;
                const normalizedToNext = cleanLevel >= MAX_LEVEL ? 0 : rawToNext > 0 ? rawToNext : XP_PER_LEVEL;

                const initialState = {
                    progression: {
                        level: cleanLevel,
                        xp: cleanXp,
                        toNext: normalizedToNext
                    },
                    quests: pdata?.quests || [],
                    perks: pdata?.perks || []
                };
                if (!isMounted) return;

                // Check if the 'inscription' questionnaire is already completed
                let done = false;
                try {
                    const { data: resp } = await supabase
                        .from('user_responses')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('questionnaire_type', 'inscription')
                        .limit(1);
                    done = Array.isArray(resp) && resp.length > 0;
                } catch {}
                if (isMounted) setInscriptionDone(done);

                const stateAfter = initialState;
                let finalResponse = gameEngine.generateResponse(stateAfter, { type: 'init' }, 0, false, []);

                // Apply stored avatar and hide the orientation test action if already completed
                if (prof) {
                    finalResponse = { ...finalResponse, avatar: buildAvatarFromProfile(prof, finalResponse.avatar, user.id) };
                }
                if (done) {
                    finalResponse = {
                        ...finalResponse,
                        suggestedActions: (finalResponse.suggestedActions || []).filter(a => a.id !== 'complete_test')
                    };
                }

                setGameState(stateAfter);
                setLastResponse(finalResponse);
            } catch (e) {
                console.error('Init load error:', e);
                const defaultState = {
                    progression: { level: 1, xp: 0, toNext: gameEngine.levelThreshold(2) },
                    quests: [],
                    perks: []
                };
                if (!isMounted) return;
                setGameState(defaultState);
                let initialResponse = gameEngine.generateResponse(defaultState, { type: 'init' }, 0, false, []);
                if (profile) {
                    initialResponse = { ...initialResponse, avatar: buildAvatarFromProfile(profile, initialResponse.avatar, user.id) };
                }
                setLastResponse(initialResponse);
            }
        })();

        return () => { isMounted = false; };
    }, [navigate, gameEngine]);

    // Keep hook order stable across renders: compute progress before any early returns
    const levelForProgress = gameState?.progression?.level ?? 1;
    const xpForProgress = gameState?.progression?.xp ?? 0;
    const progressPercent = useMemo(() => {
        // Global progress over 50 levels (5000 XP total)
        const totalXp = MAX_LEVEL * XP_PER_LEVEL;
        const clamped = Math.max(0, Math.min(totalXp, xpForProgress));
        return Math.round((clamped / totalXp) * 100);
    }, [xpForProgress]);

    if (!gameState || !lastResponse) {
        return (
            <div className="flex items-center justify-center h-screen bg-white">
                <div className="text-center">
                    <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-gray-200 relative">
                        <div className="absolute inset-1 rounded-full border-4" style={{ borderColor: '#c1ff72' }} />
                        <div className="absolute right-0 bottom-0 h-3 w-3 rounded-full" style={{ background: '#f68fff' }} />
                    </div>
                    <div className="text-lg font-semibold text-gray-800">
                        Chargement de ton aventure <span className="text-[#f68fff]">Zélia</span>…
                    </div>
                    <div className="mt-3 h-2 w-48 bg-gray-200 rounded-full mx-auto overflow-hidden">
                        <div className="h-2 bg-[#c1ff72]" style={{ width: '60%' }} />
                    </div>
                </div>
            </div>
        );
    }

    const { progression } = gameState;
    // Compute available level route (cap to implemented levels)
    const maxLevelRoute = 10;
    const currentLevel = progression?.level || 1;
    const targetLevel = Math.min(Math.max(1, currentLevel), maxLevelRoute);
    const hasAccessibleLevel = targetLevel >= 1 && targetLevel <= maxLevelRoute;
    const { ui, avatar, perks, xpGained } = lastResponse;

    

    return (
        <div className="min-h-screen bg-white p-4">
            <div className="mx-auto w-full">
                <div className="lg:grid lg:grid-cols-3 lg:gap-6">
                    <div className="lg:col-span-2 space-y-6">
                {/* Header Section with Avatar and Progress */}
                <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-card">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-6">
                            <div className="relative">
                                <img
                                    src={avatar.dicebear}
                                    alt="Avatar Zélia"
                                    className="w-28 h-28 md:w-32 md:h-32 rounded-full border-4 border-white shadow-lg"
                                    loading="lazy"
                                    decoding="async"
                                    width="96"
                                    height="96"
                                />
                                <div className="absolute -bottom-2 -right-2 bg-yellow-400 text-black px-2 py-1 rounded-full text-xs font-bold">
                                    Niv. {progression.level}
                                </div>
                            </div>
                            <div className="text-center sm:text-left">
                                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-3">
                                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2">
                                        Aventure Zélia - Niveau {progression.level}
                                    </h1>
                                    <button
                                        onClick={() => {
                                            if (hasAccessibleLevel) navigate(`/app/niveau/${targetLevel}`);
                                        }}
                                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition ${hasAccessibleLevel ? 'bg-[#f68fff] text-white border-transparent hover:opacity-90' : 'bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed'}`}
                                        title={hasAccessibleLevel ? `Aller au Niveau ${targetLevel}` : 'Tous les niveaux disponibles sont terminés'}
                                        disabled={!hasAccessibleLevel}
                                    >
                                        <span role="img" aria-label="jeu">🎮</span>
                                        <span>{hasAccessibleLevel ? `Aller au Niveau ${targetLevel}` : 'Niveaux terminés'}</span>
                                    </button>
                                </div>
                                <p className="text-gray-600 text-base md:text-lg mt-2">
                                    {ui.speak}
                                </p>
                            </div>
                        </div>
                        
                        {/* XP Notification */}
                        {xpGained > 0 && (
                            <div className="bg-[#c1ff72] text-black px-4 py-2 rounded-lg font-bold border border-gray-200 text-center md:text-right">
                                +{xpGained} XP !
                            </div>
                        )}
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="mt-6">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700">
                                {progression.xp} / {MAX_LEVEL * XP_PER_LEVEL} XP
                            </span>
                            <span className="text-sm font-medium text-gray-700">
                                {progression.level >= MAX_LEVEL ? 'Niveau max atteint' : `${progression.toNext} XP jusqu'au niveau ${progression.level + 1}`}
                            </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-4">
                            <div
                                className="h-4 rounded-full bg-[#c1ff72]"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Revoir mes résultats */}
                <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-card">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold">Revoir mes résultats</h3>
                        <button
                            onClick={() => navigate('/app/results')}
                            className="text-sm text-text-secondary hover:text-text-primary"
                        >
                            Voir tout
                        </button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4 items-center">
                        <div className="text-sm text-gray-700">
                            Consulte ton analyse et tes recommandations personnalisées pour guider tes prochaines actions.
                        </div>
                        <div className="text-right">
                            <button
                                onClick={() => navigate('/app/results')}
                                className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg text-sm"
                            >
                                <i className="ph ph-arrow-up-right"></i>
                                Ouvrir mes résultats
                            </button>
                        </div>
                    </div>
                </div>

                {/* New Perks Notification */}
                {perks && perks.length > 0 && (
                    <div className="bg-[#fffbf7] border border-gray-200 p-4 rounded-lg">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <span className="text-2xl">🎉</span>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-gray-800">
                                    <strong>Nouveaux bonus débloqués :</strong>
                                </p>
                                <ul className="list-disc list-inside text-gray-700">
                                    {perks.map((perk, index) => (
                                        <li key={index}>{perk}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* Level Progression Roadmap */}
                <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-card">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
                        Ton parcours vers le métier idéal
                    </h2>
                    
                    <div className="grid md:grid-cols-5 gap-4">
                        {[
                            { levels: '1-5', title: 'Exploration', emoji: '🌟', color: 'from-green-400 to-green-600' },
                            { levels: '6-10', title: 'Intérêts & Forces', emoji: '💪', color: 'from-blue-400 to-blue-600' },
                            { levels: '11-15', title: 'Recherche Métiers', emoji: '🔍', color: 'from-purple-400 to-purple-600' },
                            { levels: '16-20', title: 'Immersions', emoji: '🤝', color: 'from-orange-400 to-orange-600' },
                            { levels: '21-25', title: 'Compétences', emoji: '🎯', color: 'from-pink-400 to-pink-600' },
                            { levels: '26-30', title: 'CV & LM', emoji: '📄', color: 'from-indigo-400 to-indigo-600' },
                            { levels: '31-35', title: 'Parcoursup', emoji: '🎓', color: 'from-red-400 to-red-600' },
                            { levels: '36-40', title: 'Oraux', emoji: '🎤', color: 'from-yellow-400 to-yellow-600' },
                            { levels: '41-45', title: 'Excellence', emoji: '⭐', color: 'from-teal-400 to-teal-600' },
                            { levels: '46-50', title: 'Maîtrise', emoji: '👑', color: 'from-purple-600 to-pink-600' }
                        ].map((arc, index) => {
                            const arcStart = parseInt(arc.levels.split('-')[0]);
                            const arcEnd = parseInt(arc.levels.split('-')[1]);
                            const isCurrentArc = progression.level >= arcStart && progression.level <= arcEnd;
                            const isCompleted = progression.level > arcEnd;
                            
                            return (
                                <div 
                                    key={index}
                                    className={`relative p-4 rounded-xl text-center ${
                                        isCurrentArc 
                                            ? 'bg-white border-2 border-[#c1ff72] text-gray-800'
                                            : isCompleted
                                                ? 'bg-gray-100 border-2 border-green-400'
                                                : 'bg-white border border-gray-200'
                                    }`}
                                >
                                    <div className="text-2xl mb-2">{arc.emoji}</div>
                                    <div className="text-xs font-bold mb-1">Niveaux {arc.levels}</div>
                                    <div className="text-sm font-medium">{arc.title}</div>
                                    
                                    {isCompleted && (
                                        <div className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                                            ✓
                                        </div>
                                    )}
                                    
                                    {isCurrentArc && (
                                        <div className="absolute -top-2 -right-2 bg-[#c1ff72] text-black rounded-full w-6 h-6 flex items-center justify-center text-xs border border-gray-200">
                                            ⚡
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl p-4 text-center border border-gray-200 shadow-card">
                        <div className="text-2xl font-bold text-purple-600">{progression.level}</div>
                        <div className="text-sm text-gray-600">Niveau Actuel</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 text-center border border-gray-200 shadow-card">
                        <div className="text-2xl font-bold text-blue-600">{progression.xp}</div>
                        <div className="text-sm text-gray-600">XP Total</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 text-center border border-gray-200 shadow-card">
                        <div className="text-2xl font-bold text-green-600">{Math.round((progression.level / 50) * 100)}%</div>
                        <div className="text-sm text-gray-600">Progression</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 text-center border border-gray-200 shadow-card">
                        <div className="text-2xl font-bold text-orange-600">{50 - progression.level}</div>
                        <div className="text-sm text-gray-600">Niveaux Restants</div>
                    </div>
                </div>
                    </div>
                    
                    {/* Sidebar: All Quests with Status */}
                    <aside className="mt-6 lg:mt-0 lg:col-span-1 lg:sticky lg:top-6">
                        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-card">
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Toutes les quêtes</h3>
                            {(() => {
                                const completed = new Set(gameState.quests || []);
                                const total = ALL_QUEST_IDS.length;
                                const done = completed.size;
                                return (
                                    <>
                                        <p className="text-sm text-gray-600 mb-4">{done} / {total} complétée(s)</p>
                                        <ul className="space-y-2 max-h-[420px] overflow-auto pr-1">
                                            {ALL_QUEST_IDS.map((qid) => {
                                                const isDone = completed.has(qid);
                                                return (
                                                    <li key={qid} className="flex items-center justify-between">
                                                        <span className="text-sm text-gray-800">{questLabel(qid)}</span>
                                                        {isDone ? (
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-[#c1ff72] text-black border border-gray-200">OK</span>
                                                        ) : (
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">À faire</span>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </>
                                );
                            })()}
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
};

console.log('Activites component loaded');
export default Activites;
