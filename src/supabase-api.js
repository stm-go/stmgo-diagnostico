import {
  SUPABASE_URL,
  SUPABASE_KEY,
} from "./supabase-config.js";

import {
  supabaseClient,
} from "./auth.js";

export async function salvarDiagnostico({
  client,
  answers,
  result,
}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabaseClient.auth.getSession();

  if (sessionError) {
    throw new Error(
      "Não foi possível verificar a sessão."
    );
  }

  if (!session) {
    throw new Error(
      "Usuário não autenticado. Entre novamente."
    );
  }

  const scores = Object.fromEntries(
    result.scores.map((item) => [
      item.id,
      item.score,
    ])
  );

  const employeeCount = Number.parseInt(
    client.employeeCount,
    10
  );

  const diagnostic = {
    company_name:
      client.companyName ||
      "Empresa não informada",

    contact_name:
      client.contactName || null,

    contact_email:
      client.contactEmail || null,

    contact_phone:
      client.contactPhone || null,

    employee_count:
      Number.isNaN(employeeCount)
        ? null
        : employeeCount,

    segment:
      client.segment || null,

    status: "completed",

    global_score:
      result.global,

    management_score:
      scores.gestao ?? 0,

    control_score:
      scores.controle ?? 0,

    availability_score:
      scores.disponibilidade ?? 0,

    traceability_score:
      scores.rastreabilidade ?? 0,

    maturity_level:
      result.level.name,

    answers,
    recommendations:
      result.recommendations,

    created_by:
      session.user.id,
  };

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/diagnostics`,
    {
      method: "POST",

      headers: {
        apikey: SUPABASE_KEY,

        Authorization:
          `Bearer ${session.access_token}`,

        "Content-Type":
          "application/json",

        Accept:
          "application/json",

        Prefer:
          "return=representation",
      },

      body:
        JSON.stringify(diagnostic),
    }
  );

  const responseText =
    await response.text();

  let responseBody = null;

  try {
    responseBody = responseText
      ? JSON.parse(responseText)
      : null;
  } catch {
    responseBody = responseText;
  }

  if (!response.ok) {
    throw new Error(
      responseBody?.message ||
      responseBody?.hint ||
      responseText ||
      "Erro ao salvar diagnóstico."
    );
  }

  return Array.isArray(responseBody)
    ? responseBody[0]
    : responseBody;
}

export async function listarDiagnosticos() {
  const {
    data: { session },
    error: sessionError,
  } = await supabaseClient.auth.getSession();

  if (sessionError) {
    throw new Error(
      "Não foi possível verificar a sessão."
    );
  }

  if (!session) {
    throw new Error(
      "Usuário não autenticado."
    );
  }

  const userId = session.user.id;

  const columns = [
    "id",
    "company_name",
    "contact_name",
    "contact_email",
    "contact_phone",
    "employee_count",
    "segment",
    "global_score",
    "management_score",
    "control_score",
    "availability_score",
    "traceability_score",
    "maturity_level",
    "answers",
    "recommendations",
    "created_at",
    "created_by",
  ].join(",");

  const url =
    `${SUPABASE_URL}/rest/v1/diagnostics` +
    `?select=${encodeURIComponent(columns)}` +
    `&created_by=eq.${encodeURIComponent(userId)}` +
    `&order=created_at.desc`;

  const response = await fetch(url, {
    method: "GET",

    headers: {
      apikey: SUPABASE_KEY,

      Authorization:
        `Bearer ${session.access_token}`,

      Accept: "application/json",
    },
  });

  const responseText =
    await response.text();

  let responseBody = null;

  try {
    responseBody = responseText
      ? JSON.parse(responseText)
      : [];
  } catch {
    responseBody = responseText;
  }

  if (!response.ok) {
    throw new Error(
      responseBody?.message ||
        responseText ||
        "Erro ao consultar diagnósticos."
    );
  }

  return Array.isArray(responseBody)
    ? responseBody
    : [];
}

export async function excluirDiagnostico(id) {
  const {
    data: { session },
    error: sessionError,
  } = await supabaseClient.auth.getSession();

  if (sessionError) {
    throw new Error(
      "Não foi possível verificar a sessão."
    );
  }

  if (!session) {
    throw new Error(
      "Usuário não autenticado."
    );
  }

  if (!id) {
    throw new Error(
      "O diagnóstico não foi identificado."
    );
  }

  const url =
    `${SUPABASE_URL}/rest/v1/diagnostics` +
    `?id=eq.${encodeURIComponent(id)}`;

  const response = await fetch(url, {
    method: "DELETE",

    headers: {
      apikey: SUPABASE_KEY,

      Authorization:
        `Bearer ${session.access_token}`,

      Accept: "application/json",

      Prefer: "return=representation",
    },
  });

  const responseText =
    await response.text();

  let responseBody = null;

  try {
    responseBody = responseText
      ? JSON.parse(responseText)
      : [];
  } catch {
    responseBody = responseText;
  }

  if (!response.ok) {
    throw new Error(
      responseBody?.message ||
        responseBody?.hint ||
        responseText ||
        "Não foi possível excluir o diagnóstico."
    );
  }

  return Array.isArray(responseBody)
    ? responseBody[0] || null
    : responseBody;
}