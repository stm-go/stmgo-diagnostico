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

testarConexao();