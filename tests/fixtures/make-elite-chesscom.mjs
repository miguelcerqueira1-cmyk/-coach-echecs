// Fixture Chess.com SYNTHÉTIQUE (format de l'API publique, joueurs et parties fictifs) pour les
// tests hors ligne : api.chess.com n'est pas joignable depuis l'environnement de développement.
// Les fichiers lichess.org_* sont, eux, de vraies réponses enregistrées (scripts/elite.mjs --record).
//   node tests/fixtures/make-elite-chesscom.mjs tests/fixtures/elite
import { writeFileSync } from 'node:fs';
import { Chess } from '../../site/vendor/chess.js';
const dir = process.argv[2];
const w = (name, obj) => writeFileSync(`${dir}/${name}`, JSON.stringify(obj, null, 1));
w('api.chess.com_pub_leaderboards', {
  live_blitz: [{ username: 'Exemple_Blitz_A', score: 3300, title: 'GM' }, { username: 'Exemple_Blitz_B', score: 3250 }],
  live_rapid: [{ username: 'Exemple_Rapide_C', score: 2900, title: 'IM' }],
});
let n = 900000001;
function game(white, wr, black, br, moves, result, extra = {}) {
  const c = new Chess();
  for (const m of moves.split(' ')) c.move(m);
  c.setHeader('Event', 'Live Chess'); c.setHeader('Site', 'Chess.com');
  c.setHeader('White', white); c.setHeader('Black', black); c.setHeader('Result', result);
  // commentaires d'horloge comme dans les vraies archives
  const pgn = c.pgn().replace(/(\d+\. \S+)/g, '$1 {[%clk 0:02:59.9]}');
  const id = n++;
  return { url: `https://www.chess.com/game/live/${id}`, pgn, time_control: '180', end_time: 1792000000 + id % 1000 * 60,
    rated: true, time_class: 'blitz', rules: 'chess',
    white: { rating: wr, result: result === '1-0' ? 'win' : result === '0-1' ? 'resigned' : 'agreed', username: white },
    black: { rating: br, result: result === '0-1' ? 'win' : result === '1-0' ? 'resigned' : 'agreed', username: black }, ...extra };
}
const QGD = 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6';
const SLAV = 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5';
const CK = 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5';
const GDA = 'd4 d5 c4 dxc4 e3 b5 a4 c6 axb5 cxb5 Qf3';
const CK2 = 'e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3 e6';
const AB = [
  game('Exemple_Blitz_A', 3290, 'Exemple_Blitz_B', 3240, QGD, '1-0'),
  game('Exemple_Blitz_A', 3295, 'Adversaire_1', 2950, SLAV, '1/2-1/2'),
  game('Adversaire_2', 3010, 'Exemple_Blitz_A', 3300, CK, '0-1'),
  game('Exemple_Blitz_A', 3300, 'Adversaire_3', 2800, 'e4 e5 Nf3 Nc6', '1-0'), // hors répertoire
  game('Exemple_Blitz_A', 3300, 'Adversaire_4', 2800, QGD, '1-0', { time_class: 'bullet' }), // bullet : exclu
  game('Exemple_Blitz_A', 3300, 'Adversaire_5', 2800, QGD, '0-1', { rated: false }), // amicale : exclue
];
const B = [
  AB[0], // même partie vue depuis l'autre joueur : dédoublonnée
  game('Exemple_Blitz_B', 3245, 'Adversaire_6', 2900, QGD, '1/2-1/2'),
  game('Adversaire_7', 2980, 'Exemple_Blitz_B', 3250, CK2, '1-0'),
  game('Exemple_Blitz_B', 3248, 'Adversaire_11', 2870, GDA, '1-0'),
];
const C = [
  game('Exemple_Rapide_C', 2890, 'Adversaire_8', 2700, QGD, '1-0', { time_class: 'rapid', time_control: '600' }),
  game('Adversaire_9', 2750, 'Exemple_Rapide_C', 2900, CK, '1/2-1/2', { time_class: 'rapid', time_control: '600' }),
  game('Exemple_Rapide_C', 2895, 'Adversaire_12', 2760, GDA, '0-1', { time_class: 'rapid', time_control: '600' }),
  game('Adversaire_10', 2750, 'Exemple_Rapide_C', 2900, CK, '0-1', { time_class: 'blitz' }), // pas dans son classement blitz
];
const arch = (u) => ({ archives: [`https://api.chess.com/pub/player/${u}/games/2026/09`, `https://api.chess.com/pub/player/${u}/games/2026/10`] });
for (const [u, list] of [['exemple_blitz_a', AB], ['exemple_blitz_b', B], ['exemple_rapide_c', C]]) {
  w(`api.chess.com_pub_player_${u}_games_archives`, arch(u));
  w(`api.chess.com_pub_player_${u}_games_2026_10`, { games: list });
  // 2026/09 tronqué pour exemple_rapide_c : erreur notée, les autres mois et joueurs continuent
  if (u !== 'exemple_rapide_c') w(`api.chess.com_pub_player_${u}_games_2026_09`, { games: [] });
  else writeFileSync(`${dir}/api.chess.com_pub_player_${u}_games_2026_09`, '{"games":[{"url":"tronqu');
}

// Profils de joueurs suivis (SYNTHÉTIQUES, format /pub/player/{u}) : un compte vérifié avec une partie,
// un compte vérifié sans partie, un compte au nom discordant (rejeté). Les autres comptes candidats
// n'ont pas de fichier : « introuvable ».
w('api.chess.com_pub_player_magnuscarlsen', { username: 'magnuscarlsen', title: 'GM', name: 'Magnus Carlsen', status: 'premium' });
w('api.chess.com_pub_player_magnuscarlsen_games_archives', arch('magnuscarlsen'));
w('api.chess.com_pub_player_magnuscarlsen_games_2026_10', { games: [
  game('Adversaire_13', 2810, 'MagnusCarlsen', 2950, CK2, '0-1', { time_class: 'rapid', time_control: '600' }),
] });
w('api.chess.com_pub_player_magnuscarlsen_games_2026_09', { games: [] });
w('api.chess.com_pub_player_hikaru', { username: 'hikaru', title: 'GM', name: 'Hikaru Nakamura', status: 'premium' });
w('api.chess.com_pub_player_hikaru_games_archives', { archives: [] });
w('api.chess.com_pub_player_lachesisq', { username: 'lachesisq', title: 'GM', name: 'Quelqu’un d’autre', status: 'basic' });
