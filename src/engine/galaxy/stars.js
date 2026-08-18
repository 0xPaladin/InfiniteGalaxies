/**
 * Approximate main-sequence mass (M☉) from spectral type
 */
function spectralToMass(type) {
  const map = {
    'O': 20 + Math.random() * 20,   // very rough
    'B': 3 + Math.random() * 12,
    'A': 1.6 + Math.random() * 0.8,
    'F': 1.1 + Math.random() * 0.4,
    'G': 0.85 + Math.random() * 0.25,
    'K': 0.5 + Math.random() * 0.3,
    'M': 0.1 + Math.random() * 0.4
  };
  return map[type] || 0.5;
}

/**
 * Rough spectral type from mass
 */
function massToSpectral(mass) {
  if (mass >= 16) return 'O';
  if (mass >= 2.5) return 'B';
  if (mass >= 1.5) return 'A';
  if (mass >= 1.05) return 'F';
  if (mass >= 0.8) return 'G';
  if (mass >= 0.45) return 'K';
  return 'M';
}

/**
 * Sample orbital period (years) – approximate log-normal
 * Solar-type peak ~ 100–300 yr (Raghavan / Duquennoy & Mayor)
 * Wider dispersion for simplicity
 */
function samplePeriodYears(rng, primaryMass) {
  // log10(P years) ~ Normal(μ, σ)
  // μ ≈ 2.2 (≈ 160 yr) for solar-type; slightly lower for lower-mass
  const mu = 2.0 + 0.3 * Math.min(primaryMass, 1.5);
  const sigma = 1.6;
  let logP = mu + (rng() + rng() + rng() + rng() - 2) * sigma; // rough normal
  logP = Math.max(-1.5, Math.min(6.5, logP)); // clamp ~ 0.03 yr → 3 Myr
  return Math.pow(10, logP);
}

/**
 * Kepler’s 3rd law: a³ / P² = M_tot   (a in AU, P in years, M in M☉)
 */
function periodToSeparation(periodYears, totalMass) {
  return Math.pow(periodYears * periodYears * totalMass, 1/3);
}

/**
 * Sample mass ratio q = M2/M1
 * Roughly flat with mild twin preference for closer systems
 */
function sampleMassRatio(rng, isClose = false) {
  let q = rng(); // 0–1
  if (isClose && rng() < 0.25) {
    q = 0.7 + rng() * 0.3; // twin boost
  }
  return Math.max(0.08, Math.min(0.98, q));
}

/**
 * Independent star / system generator
 *
 * @param {function} rng
 * @param {object} [options]
 * @param {boolean} [options.forceHabitable]
 * @param {string}  [options.forcedType]
 * @returns {object} full system description
 */
export function generateStar(rng, options = {}) {
  // --- Spectral type of primary ---
  const spectralTable = [
    { type: 'O', weight: 0.00003, multBias: 0.95 },
    { type: 'B', weight: 0.0013,  multBias: 0.88 },
    { type: 'A', weight: 0.006,   multBias: 0.70 },
    { type: 'F', weight: 0.03,    multBias: 0.55 },
    { type: 'G', weight: 0.076,   multBias: 0.50 },
    { type: 'K', weight: 0.12,    multBias: 0.40 },
    { type: 'M', weight: 0.766,   multBias: 0.28 }
  ];

  let primaryType;
  if (options.forcedType) {
    primaryType = options.forcedType;
  } else if (options.forceHabitable) {
    const hab = [
      { type: 'F', weight: 0.25 },
      { type: 'G', weight: 0.45 },
      { type: 'K', weight: 0.30 }
    ];
    primaryType = weightedPick(hab, rng);
  } else {
    primaryType = weightedPick(spectralTable, rng);
  }

  const primaryMass = spectralToMass(primaryType);
  const primary = {
    role: 'primary',
    spectral: primaryType,
    lumClass: rng() < 0.92 ? 'V' : (rng() < 0.65 ? 'III' : 'IV'),
    mass: +primaryMass.toFixed(3)
  };

  // --- Multiplicity decision ---
  const bias = spectralTable.find(s => s.type === primaryType)?.multBias ?? 0.3;
  const roll = rng();
  let multiplicity = 1;
  if (roll < bias * 0.55) multiplicity = 2;
  else if (roll < bias * 0.72) multiplicity = 3;
  else if (roll < bias * 0.82) multiplicity = 4;

  const companions = [];
  let currentPrimaryMass = primaryMass;

  // Generate companions (hierarchical for triples+)
  for (let i = 1; i < multiplicity; i++) {
    const isOuter = i > 1; // outer companions get larger separations
    const period = samplePeriodYears(rng, primaryMass) * (isOuter ? (8 + rng() * 40) : 1);
    const q = sampleMassRatio(rng, period < 30);
    const compMass = currentPrimaryMass * q;
    const totalMass = currentPrimaryMass + compMass;
    const sepAU = periodToSeparation(period, totalMass);

    companions.push({
      role: i === 1 ? 'secondary' : `companion${i}`,
      spectral: massToSpectral(compMass),
      mass: +compMass.toFixed(3),
      separationAU: +sepAU.toFixed(2),
      periodYears: +period.toFixed(1),
      massRatio: +q.toFixed(3)
    });

    // For hierarchical systems the “inner” mass can be treated as combined
    // (simplified – real hierarchy is more complex)
    if (i === 1) currentPrimaryMass = totalMass;
  }

  const isHabitableCandidate = !!options.forceHabitable ||
    (['F','G','K'].includes(primaryType) &&
     primary.lumClass === 'V' &&
     multiplicity === 1 &&
     rng() < 0.18);

  return {
    primary,
    companions,
    multiplicity,
    isHabitableCandidate,
    // convenience totals
    totalMass: +(primary.mass + companions.reduce((s, c) => s + c.mass, 0)).toFixed(3),
    x: null,
    y: null
  };
}

function weightedPick(table, rng) {
  const total = table.reduce((s, t) => s + t.weight, 0);
  let r = rng() * total;
  for (const item of table) {
    r -= item.weight;
    if (r <= 0) return item.type;
  }
  return table[table.length - 1].type;
}