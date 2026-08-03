import {
  SUPABASE_URL,
  SUPABASE_KEY,
} from "./supabase-config.js";

export async function salvarDiagnostico({
  client,
  answers,
  result,
}) {
  const scores = Object.fromEntries(
    result.scores.map((item) => [
      item.id,
      item.score,
    ])
  );

  const employeeCount =
    Number.parseInt(client.employeeCount, 10);

  const diagnostic = {
    company_name: client.companyName,
    contact_name: client.contactName || null,
    contact_email: client.contactEmail || null,
    contact_phone: client.contactPhone || null,

    employee_count: Number.isNaN(employeeCount)
      ? null
      : employeeCount,

    segment: client.segment || null,
    status: "completed",

    global_score: result.global,
    management_score: scores.gestao ?? 0,
    control_score: scores.controle ?? 0,

    availability_score:
      scores.disponibilidade ?? 0,

    traceability_score:
      scores.rastreabilidade ?? 0,

    maturity_level: result.level.name,
    answers,
    recommendations: result.recommendations,
  };

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/diagnostics`,
    {
      method: "POST",

      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },

      body: JSON.stringify(diagnostic),
    }
  );

  const responseBody = await response.json();

  if (!response.ok) {
    throw new Error(
      responseBody?.message ||
        responseBody?.hint ||
        "Erro ao salvar diagnóstico."
    );
  }

  return responseBody[0];
}