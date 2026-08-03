import {
  SUPABASE_URL,
  SUPABASE_KEY,
} from "./supabase-config.js";

const createClient =
  window.supabase?.createClient;

if (!createClient) {
  throw new Error(
    "A biblioteca do Supabase não foi carregada."
  );
}

export const supabaseClient =
  createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );

function mostrarLogin() {
  const screens = [
    "home",
    "questions",
    "client",
    "review",
    "history",
    "result",
  ];

  screens.forEach((name) => {
    document
      .getElementById(`screen-${name}`)
      ?.classList.add("hidden");
  });

  document
    .getElementById("screen-login")
    ?.classList.remove("hidden");

  const loggedUser =
    document.getElementById("loggedUser");

  if (loggedUser) {
    loggedUser.textContent =
      "Usuário não autenticado";
  }
}

function mostrarAplicativo(session) {
  document
    .getElementById("screen-login")
    ?.classList.add("hidden");

  document
    .getElementById("screen-home")
    ?.classList.remove("hidden");

  const loggedUser =
    document.getElementById("loggedUser");

  if (loggedUser) {
    loggedUser.textContent =
      session?.user?.email ||
      "Usuário autenticado";
  }

  const status =
    document.getElementById(
      "supabase-status"
    );

  if (status) {
    status.textContent =
      "Usuário autenticado.";

    status.style.color =
      "#15803d";
  }
}

async function fazerLogin(event) {
  event?.preventDefault();

  const emailInput =
    document.getElementById(
      "loginEmail"
    );

  const passwordInput =
    document.getElementById(
      "loginPassword"
    );

  const errorBox =
    document.getElementById(
      "loginError"
    );

  const button =
    document.getElementById(
      "loginBtn"
    );

  const email =
    emailInput?.value.trim();

  const password =
    passwordInput?.value;

  if (errorBox) {
    errorBox.classList.add(
      "hidden"
    );
  }

  if (!email || !password) {
    if (errorBox) {
      errorBox.textContent =
        "Preencha o e-mail e a senha.";

      errorBox.classList.remove(
        "hidden"
      );
    }

    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent =
      "Entrando...";
  }

  try {
    console.log(
      "Tentando login:",
      email
    );

    const {
      data,
      error,
    } =
      await supabaseClient.auth
        .signInWithPassword({
          email,
          password,
        });

    if (error) {
      throw error;
    }

    if (!data.session) {
      throw new Error(
        "O Supabase não retornou uma sessão."
      );
    }

    console.log(
      "Login realizado:",
      data.user?.email
    );

    mostrarAplicativo(
      data.session
    );
  } catch (error) {
    console.error(
      "Erro no login:",
      error
    );

    if (errorBox) {
      errorBox.textContent =
        error.message ||
        "E-mail ou senha inválidos.";

      errorBox.classList.remove(
        "hidden"
      );
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        "Entrar";
    }
  }
}

async function sairDaConta() {
  const {
    error,
  } =
    await supabaseClient.auth
      .signOut({
        scope: "local",
      });

  if (error) {
    console.error(
      "Erro ao sair:",
      error
    );

    alert(
      "Não foi possível sair."
    );

    return;
  }

  mostrarLogin();
}

async function verificarSessao() {
  const {
    data,
    error,
  } =
    await supabaseClient.auth
      .getSession();

  if (error) {
    console.error(
      "Erro ao verificar sessão:",
      error
    );

    mostrarLogin();
    return;
  }

  if (data.session) {
    console.log(
      "Sessão encontrada:",
      data.session.user.email
    );

    mostrarAplicativo(
      data.session
    );
  } else {
    mostrarLogin();
  }
}

const loginForm =
  document.getElementById(
    "loginForm"
  );

if (loginForm) {
  loginForm.addEventListener(
    "submit",
    fazerLogin
  );
} else {
  console.error(
    "Formulário loginForm não encontrado."
  );
}

document
  .getElementById("logoutBtn")
  ?.addEventListener(
    "click",
    sairDaConta
  );

supabaseClient.auth
  .onAuthStateChange(
    (event, session) => {
      console.log(
        "Evento de autenticação:",
        event
      );

      if (event === "SIGNED_OUT") {
        mostrarLogin();
        return;
      }

      if (
        session &&
        (
          event === "SIGNED_IN" ||
          event === "INITIAL_SESSION" ||
          event === "TOKEN_REFRESHED"
        )
      ) {
        mostrarAplicativo(
          session
        );
      }
    }
  );

verificarSessao();