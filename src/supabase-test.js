import {
  SUPABASE_URL,
  SUPABASE_KEY,
} from "./supabase-config.js";

async function testarConexao() {
  const status = document.getElementById(
    "supabase-status"
  );

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/diagnostics?select=id&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_KEY,
          Accept: "application/json",
        },
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Erro ${response.status}: ${responseText}`
      );
    }

    status.textContent =
      "Supabase conectado com sucesso.";

    status.style.color = "#15803d";
  } catch (error) {
    console.error(
      "Erro ao conectar com o Supabase:",
      error
    );

    status.textContent =
      "Não foi possível conectar ao Supabase.";

    status.style.color = "#b91c1c";
  }
}

window.testarSalvamento = async function () {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/diagnostics`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        company_name: "TESTE MANUAL",
        contact_name: "Isabella",
        status: "completed",
        global_score: 50,
        management_score: 50,
        control_score: 50,
        availability_score: 50,
        traceability_score: 50,
        maturity_level: "Moderado",
        answers: {},
        recommendations: [],
      }),
    }
  );

  const texto = await response.text();

  console.log(
    "Status do salvamento:",
    response.status
  );

  console.log(
    "Resposta do Supabase:",
    texto
  );
};

testarConexao();