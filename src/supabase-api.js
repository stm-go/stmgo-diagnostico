import {
  SUPABASE_URL,
  SUPABASE_KEY,
} from "./supabase-config.js";

import {
  supabaseClient,
} from "./auth.js";

async function getAuthenticatedSession() {
  const {
    data: { session },
    error,
  } =
    await supabaseClient.auth
      .getSession();

  if (error) {
    throw new Error(
      "Não foi possível verificar a sessão."
    );
  }

  if (!session) {
    throw new Error(
      "Usuário não autenticado. Entre novamente."
    );
  }

  return session;
}

async function parseResponse(response) {
  const text =
    await response.text();

  let body = null;

  try {
    body = text
      ? JSON.parse(text)
      : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(
      body?.message ||
      body?.hint ||
      text ||
      `Erro ${response.status} ao acessar o Supabase.`
    );
  }

  return body;
}

function buildDiagnosticPayload({
  client,
  answers,
  result,
}) {
  const scores =
    Object.fromEntries(
      result.scores.map(
        (item) => [
          item.id,
          item.score,
        ]
      )
    );

  const employeeCount =
    Number.parseInt(
      client.employeeCount,
      10
    );

  return {
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

    client_notes:
      client.clientNotes || null,

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

    final_considerations:
      result.final_considerations ||
      null,
  };
}

function authenticatedHeaders(
  session,
  extra = {}
) {
  return {
    apikey:
      SUPABASE_KEY,

    Authorization:
      `Bearer ${session.access_token}`,

    Accept:
      "application/json",

    ...extra,
  };
}

export async function salvarDiagnostico({
  client,
  answers,
  result,
}) {
  const session =
    await getAuthenticatedSession();

  const payload = {
    ...buildDiagnosticPayload({
      client,
      answers,
      result,
    }),

    created_by:
      session.user.id,
  };

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/diagnostics`,
      {
        method: "POST",

        headers:
          authenticatedHeaders(
            session,
            {
              "Content-Type":
                "application/json",

              Prefer:
                "return=representation",
            }
          ),

        body:
          JSON.stringify(payload),
      }
    );

  const body =
    await parseResponse(response);

  return Array.isArray(body)
    ? body[0]
    : body;
}

export async function atualizarDiagnostico({
  id,
  client,
  answers,
  result,
}) {
  if (!id) {
    throw new Error(
      "Diagnóstico não identificado."
    );
  }

  const session =
    await getAuthenticatedSession();

  const params =
    new URLSearchParams({
      id:
        `eq.${id}`,

      created_by:
        `eq.${session.user.id}`,
    });

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/diagnostics?${params}`,
      {
        method: "PATCH",

        headers:
          authenticatedHeaders(
            session,
            {
              "Content-Type":
                "application/json",

              Prefer:
                "return=representation",
            }
          ),

        body:
          JSON.stringify(
            buildDiagnosticPayload({
              client,
              answers,
              result,
            })
          ),
      }
    );

  const body =
    await parseResponse(response);

  const updated =
    Array.isArray(body)
      ? body[0]
      : body;

  if (!updated) {
    throw new Error(
      "O diagnóstico não foi encontrado ou não pertence ao usuário."
    );
  }

  return updated;
}

function cleanSearchTerm(
  value = ""
) {
  return String(value)
    .replace(
      /[*,().%]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .slice(0, 80);
}

export async function listarDiagnosticos({
  page = 1,
  pageSize = 8,
  search = "",
  maturity = "",
} = {}) {
  const session =
    await getAuthenticatedSession();

  const safePage =
    Math.max(
      1,
      Number(page) || 1
    );

  const safePageSize =
    Math.min(
      50,
      Math.max(
        1,
        Number(pageSize) || 8
      )
    );

  const offset =
    (safePage - 1) *
    safePageSize;

  const columns = [
    "id",
    "company_name",
    "contact_name",
    "contact_email",
    "contact_phone",
    "employee_count",
    "segment",
    "client_notes",
    "status",
    "global_score",
    "management_score",
    "control_score",
    "availability_score",
    "traceability_score",
    "maturity_level",
    "answers",
    "recommendations",
    "final_considerations",
    "created_at",
    "updated_at",
    "created_by",
  ].join(",");

  const params =
    new URLSearchParams();

  params.set(
    "select",
    columns
  );

  params.set(
    "created_by",
    `eq.${session.user.id}`
  );

  params.set(
    "order",
    "updated_at.desc,created_at.desc"
  );

  params.set(
    "limit",
    String(safePageSize)
  );

  params.set(
    "offset",
    String(offset)
  );

  const term =
    cleanSearchTerm(search);

  if (term) {
    params.set(
      "or",
      `(company_name.ilike.*${term}*,contact_name.ilike.*${term}*)`
    );
  }

  if (maturity) {
    params.set(
      "maturity_level",
      `eq.${maturity}`
    );
  }

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/diagnostics?${params}`,
      {
        method: "GET",

        headers:
          authenticatedHeaders(
            session,
            {
              Prefer:
                "count=exact",
            }
          ),
      }
    );

  const body =
    await parseResponse(response);

  const contentRange =
    response.headers.get(
      "content-range"
    ) || "0-0/0";

  const totalPart =
    contentRange.split("/")[1];

  const total =
    totalPart === "*"
      ? 0
      : Number(totalPart) || 0;

  return {
    records:
      Array.isArray(body)
        ? body
        : [],

    total,
    page:
      safePage,

    pageSize:
      safePageSize,
  };
}

export async function excluirDiagnostico(
  id
) {
  if (!id) {
    throw new Error(
      "O diagnóstico não foi identificado."
    );
  }

  const session =
    await getAuthenticatedSession();

  const params =
    new URLSearchParams({
      id:
        `eq.${id}`,

      created_by:
        `eq.${session.user.id}`,
    });

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/diagnostics?${params}`,
      {
        method: "DELETE",

        headers:
          authenticatedHeaders(
            session,
            {
              Prefer:
                "return=representation",
            }
          ),
      }
    );

  const body =
    await parseResponse(response);

  const deleted =
    Array.isArray(body)
      ? body[0]
      : body;

  if (!deleted) {
    throw new Error(
      "O diagnóstico não foi encontrado ou não pertence ao usuário."
    );
  }

  return deleted;
}