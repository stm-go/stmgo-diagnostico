import {
  supabaseClient,
} from "./auth.js";

const AI_ENDPOINT =
  "/api/generate-diagnostic-ai";

const REQUEST_TIMEOUT =
  90000;

async function getAccessToken() {
  const {
    data,
    error,
  } =
    await supabaseClient.auth
      .getSession();

  if (error) {
    throw new Error(
      "Não foi possível verificar a sessão do usuário."
    );
  }

  if (!data.session) {
    throw new Error(
      "Sua sessão expirou. Entre novamente no sistema."
    );
  }

  return data.session
    .access_token;
}

async function parseResponse(
  response
) {
  const text =
    await response.text();

  let body = null;

  try {
    body = text
      ? JSON.parse(text)
      : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new Error(
      body?.message ||
      text ||
      "Não foi possível gerar o conteúdo com IA."
    );
  }

  if (!body?.success) {
    throw new Error(
      body?.message ||
      "A IA não retornou um resultado válido."
    );
  }

  return body.result;
}

async function callDiagnosticAi({
  type,
  diagnostic,
}) {
  const allowedTypes = [
    "recommendations",
    "considerations",
  ];

  if (
    !allowedTypes.includes(type)
  ) {
    throw new Error(
      "Tipo de geração com IA inválido."
    );
  }

  if (!diagnostic) {
    throw new Error(
      "Os dados do diagnóstico não foram informados."
    );
  }

  const accessToken =
    await getAccessToken();

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      REQUEST_TIMEOUT
    );

  try {
    const response =
      await fetch(
        AI_ENDPOINT,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${accessToken}`,
          },

          body:
            JSON.stringify({
              type,
              diagnostic,
            }),

          signal:
            controller.signal,
        }
      );

    return await parseResponse(
      response
    );
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw new Error(
        "A geração demorou mais que o esperado. Tente novamente."
      );
    }

    if (
      /failed to fetch/i.test(
        String(
          error?.message || ""
        )
      )
    ) {
      throw new Error(
        "Não foi possível conectar ao serviço de IA."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function revisarRecomendacoesComIa(
  diagnostic
) {
  const result =
    await callDiagnosticAi({
      type:
        "recommendations",

      diagnostic,
    });

  if (
    !Array.isArray(
      result?.recommendations
    )
  ) {
    throw new Error(
      "A IA não retornou recomendações válidas."
    );
  }

  return result
    .recommendations;
}

export async function gerarConsideracoesComIa(
  diagnostic
) {
  const result =
    await callDiagnosticAi({
      type:
        "considerations",

      diagnostic,
    });

  const text =
    String(
      result
        ?.finalConsiderations ||
      ""
    ).trim();

  if (!text) {
    throw new Error(
      "A IA não retornou as considerações finais."
    );
  }

  return text;
}