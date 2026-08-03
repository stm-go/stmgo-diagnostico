const DIACRITICS = /[\u0300-\u036f]/g;

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/[“”\"]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }

  return rows;
}

export function answerScore(answerId, config) {
  const option = config.answerOptions.find((item) => item.id === answerId);
  return option ? option.score : null;
}

export function getMaturityLevel(score, config) {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  return config.maturityLevels.find(
    (level) => safeScore >= level.min && safeScore <= level.max,
  ) ?? config.maturityLevels[0];
}

export function calculateSectionScore(section, answers, config) {
  let weightedScore = 0;
  let possibleScore = 0;
  let answered = 0;
  let pending = 0;

  for (const question of section.questions) {
    const answer = answers[question.id];
    const score = answerScore(answer?.value, config);

    if (score === null || score === undefined) {
      if (answer?.value === "unknown") pending += 1;
      continue;
    }

    const weight = Number(question.weight ?? 1);
    weightedScore += score * weight;
    possibleScore += 100 * weight;
    answered += 1;
  }

  const rawScore = possibleScore > 0 ? weightedScore / possibleScore * 100 : 0;
  const score = Math.round(rawScore);

  return {
    sectionId: section.id,
    sectionName: section.name,
    score,
    rawScore,
    answered,
    pending,
    total: section.questions.length,
    maturity: getMaturityLevel(score, config),
  };
}

export function generateRecommendations(answers, config) {
  const recommendationsByKey = new Map(
    config.recommendations.map((item) => [item.key, item]),
  );
  const generated = new Map();

  for (const section of config.sections) {
    for (const question of section.questions) {
      const answer = answers[question.id];
      if (!answer || !["partial", "no"].includes(answer.value)) continue;

      const recommendation = recommendationsByKey.get(question.recommendationKey);
      if (!recommendation) continue;

      const existing = generated.get(recommendation.key);
      const severity = recommendation.severity[answer.value] ?? "medium";
      const evidence = {
        questionId: question.id,
        question: question.text,
        answer: answer.value,
        observation: answer.observation ?? "",
      };

      if (existing) {
        existing.evidence.push(evidence);
        if (severityRank(severity) > severityRank(existing.severity)) {
          existing.severity = severity;
        }
      } else {
        generated.set(recommendation.key, {
          key: recommendation.key,
          title: recommendation.title,
          description: recommendation.description,
          severity,
          priority: recommendation.priority,
          evidence: [evidence],
        });
      }
    }
  }

  return [...generated.values()].sort((a, b) => {
    const severityDifference = severityRank(b.severity) - severityRank(a.severity);
    if (severityDifference !== 0) return severityDifference;
    return a.priority - b.priority;
  });
}

export function calculateDiagnostic(answers, config) {
  const sections = config.sections.map((section) =>
    calculateSectionScore(section, answers, config),
  );
  const rawGlobal = sections.length
    ? sections.reduce((sum, section) => sum + section.rawScore, 0) / sections.length
    : 0;
  const score = Math.round(rawGlobal);
  const totalQuestions = config.sections.reduce(
    (sum, section) => sum + section.questions.length,
    0,
  );
  const answeredQuestions = sections.reduce((sum, section) => sum + section.answered, 0);
  const pendingQuestions = sections.reduce((sum, section) => sum + section.pending, 0);

  return {
    score,
    rawScore: rawGlobal,
    maturity: getMaturityLevel(score, config),
    sections,
    totalQuestions,
    answeredQuestions,
    pendingQuestions,
    completion: Math.round((answeredQuestions + pendingQuestions) / totalQuestions * 100),
    recommendations: generateRecommendations(answers, config),
  };
}

function severityRank(severity) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity] ?? 0;
}

function findValueByLabel(rows, labels) {
  const normalizedLabels = labels.map(normalizeText);
  for (const row of rows) {
    const first = normalizeText(row[0]);
    if (normalizedLabels.some((label) => first === label || first.startsWith(label))) {
      return String(row[1] ?? "").trim();
    }
  }
  return "";
}

function optionalNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function inferLegacyAnswer(row) {
  const yes = optionalNumber(row[1]);
  const partial = optionalNumber(row[2]);
  const no = optionalNumber(row[3]);
  const result = optionalNumber(row[4]);

  if (yes === 100 || result === 100) return "yes";
  if (partial === 50 || result === 50) return "partial";
  if (no === 0 || result === 0) return "no";
  return "unknown";
}

function bestQuestionMatch(text, config) {
  const target = normalizeText(text);
  let best = null;
  let bestScore = 0;

  for (const section of config.sections) {
    for (const question of section.questions) {
      const candidates = [question.text, ...(question.aliases ?? [])];
      for (const candidateText of candidates) {
        const candidate = normalizeText(candidateText);
        const score = similarity(target, candidate);
        if (score > bestScore) {
          bestScore = score;
          best = question;
        }
      }
    }
  }

  return bestScore >= 0.62 ? best : null;
}

function similarity(a, b) {
  if (a === b) return 1;
  const aTokens = new Set(a.split(" ").filter((token) => token.length > 2));
  const bTokens = new Set(b.split(" ").filter((token) => token.length > 2));
  if (!aTokens.size || !bTokens.size) return 0;
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return intersection / union;
}

export function importLegacyCsv(csvText, config) {
  const rows = parseCsv(csvText);
  const client = {
    companyName: findValueByLabel(rows, ["Nome da Empresa"]),
    contactName: findValueByLabel(rows, ["Contato"]),
    employeeCount: Number(findValueByLabel(rows, ["Número colaboradores"])) || null,
    email: "",
    phone: "",
    segment: "",
  };

  const answers = {};
  const unmatchedRows = [];
  let inQuestionBlock = false;
  let inRecommendations = false;
  const legacyRecommendations = [];

  for (const row of rows) {
    const first = String(row[0] ?? "").trim();
    const normalized = normalizeText(first);
    const normalizedRow = normalizeText(row.filter(Boolean).join(" "));

    if (normalized === "perguntas") {
      inQuestionBlock = true;
      continue;
    }

    if (normalizedRow.startsWith("resultado ") || normalizedRow === "resultado") {
      inQuestionBlock = false;
      continue;
    }

    if (normalized === "acoes recomendadas") {
      inRecommendations = true;
      inQuestionBlock = false;
      continue;
    }

    if (inRecommendations && first) {
      legacyRecommendations.push(first);
      continue;
    }

    if (!inQuestionBlock || !first || normalized.startsWith("resultado")) continue;

    const question = bestQuestionMatch(first, config);
    if (!question) {
      unmatchedRows.push(first);
      continue;
    }

    answers[question.id] = {
      value: inferLegacyAnswer(row),
      observation: String(row[5] ?? "").trim(),
      importedQuestion: first,
    };
  }

  const calculated = calculateDiagnostic(answers, config);
  const legacyScores = {
    global: Number(findValueByLabel(rows, ["SCORE GLOBAL"])) || null,
    gestao: Number(findValueByLabel(rows, ["SCORE - GESTÃO"])) || null,
    controle: Number(findValueByLabel(rows, ["SCORE - CONTROLE"])) || null,
    disponibilidade: Number(findValueByLabel(rows, ["SCORE - DISPONIBILIDADE"])) || null,
    rastreabilidade: Number(findValueByLabel(rows, ["SCORE - RASTREABILIDADE"])) || null,
  };

  return {
    source: "legacy-csv",
    importedAt: new Date().toISOString(),
    client,
    answers,
    result: calculated,
    legacyScores,
    legacyRecommendations,
    unmatchedRows,
  };
}
