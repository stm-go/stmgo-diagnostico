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

const ALL_SCREENS = [
  "login",
  "home",
  "questions",
  "client",
  "review",
  "history",
  "result",
];

function hideAllScreens() {
  ALL_SCREENS.forEach((name) => {
    document
      .getElementById(`screen-${name}`)
      ?.classList.add("hidden");
  });
}

function setAuthStatus(
  message,
  type = "info"
) {
  const status =
    document.getElementById(
      "supabase-status"
    );

  if (!status) {
    return;
  }

  status.textContent =
    message;

  status.className =
    `status-toast ${type}`;
}

function showLogin() {
  hideAllScreens();

  const loginScreen =
    document.getElementById(
      "screen-login"
    );

  if (!loginScreen) {
    console.error(
      "A tela screen-login não foi encontrada."
    );

    return;
  }

  loginScreen.classList.remove(
    "hidden"
  );

  document
    .getElementById(
      "sessionControls"
    )
    ?.classList.add("hidden");

  const password =
    document.getElementById(
      "loginPassword"
    );

  if (password) {
    password.value = "";
  }

  setAuthStatus(
    "Faça login para continuar.",
    "info"
  );
}

function updateAuthenticatedUI(
  session
) {
  document
    .getElementById(
      "sessionControls"
    )
    ?.classList.remove(
      "hidden"
    );

  const loggedUser =
    document.getElementById(
      "loggedUser"
    );

  if (loggedUser) {
    loggedUser.textContent =
      session?.user?.email ||
      "Usuário autenticado";
  }

  setAuthStatus(
    "Usuário autenticado.",
    "success"
  );
}

function showApplication(
  session
) {
  hideAllScreens();

  const homeScreen =
    document.getElementById(
      "screen-home"
    );

  if (!homeScreen) {
    console.error(
      "A tela screen-home não foi encontrada."
    );

    alert(
      "A tela inicial não foi encontrada no index.html."
    );

    return;
  }

  homeScreen.classList.remove(
    "hidden"
  );

  updateAuthenticatedUI(
    session
  );
}

function authErrorMessage(error) {
  const message =
    String(error?.message || "");

  if (
    /invalid login credentials/i.test(
      message
    )
  ) {
    return "E-mail ou senha inválidos.";
  }

  if (
    /email not confirmed/i.test(
      message
    )
  ) {
    return "O e-mail ainda não foi confirmado.";
  }

  if (
    /network|fetch/i.test(message)
  ) {
    return "Não foi possível conectar ao serviço de autenticação.";
  }

  return (
    message ||
    "Não foi possível entrar."
  );
}

async function login(event) {
  event.preventDefault();

  const email =
    document
      .getElementById("loginEmail")
      ?.value.trim();

  const password =
    document
      .getElementById(
        "loginPassword"
      )
      ?.value;

  const errorBox =
    document.getElementById(
      "loginError"
    );

  const button =
    document.getElementById(
      "loginBtn"
    );

  errorBox?.classList.add("hidden");

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

    showApplication(
      data.session
    );
  } catch (error) {
    if (errorBox) {
      errorBox.textContent =
        authErrorMessage(error);

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

async function logout() {
  const button =
    document.getElementById(
      "logoutBtn"
    );

  if (button) {
    button.disabled = true;
    button.textContent =
      "Saindo...";
  }

  try {
    const {
      error,
    } =
      await supabaseClient.auth
        .signOut({
          scope: "local",
        });

    if (error) {
      throw error;
    }

    DRAFT_KEYS.forEach(
      (key) => {
        localStorage.removeItem(key);
      }
    );

    window.dispatchEvent(
      new CustomEvent(
        "stmgo:signed-out"
      )
    );

    showLogin();
  } catch (error) {
    setAuthStatus(
      error.message ||
        "Não foi possível sair.",
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        "Sair";
    }
  }
}

async function verifySession() {
  const {
    data,
    error,
  } =
    await supabaseClient.auth
      .getSession();

  if (
    error ||
    !data.session
  ) {
    showLogin();
    return;
  }

  showApplication(
    data.session
  );
}

document
  .getElementById("loginForm")
  ?.addEventListener(
    "submit",
    login
  );

document
  .getElementById("logoutBtn")
  ?.addEventListener(
    "click",
    logout
  );

supabaseClient.auth
  .onAuthStateChange(
    (event, session) => {
      if (
        event === "SIGNED_OUT"
      ) {
        showLogin();
        return;
      }

      if (session) {
        updateAuthenticatedUI(
          session
        );
      }
    }
  );

verifySession();