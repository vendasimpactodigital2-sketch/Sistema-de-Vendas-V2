import { CompanyProfile } from "../types";

/**
 * Retorna o perfil da empresa gravado localmente de forma segura.
 */
export function getStoredCompanyProfile(): CompanyProfile | null {
  try {
    const saved = localStorage.getItem("NUCLEO_COMPANY_PROFILE");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Erro ao ler NUCLEO_COMPANY_PROFILE do localStorage:", e);
  }
  return null;
}

/**
 * Salva o perfil da empresa de forma resiliente tanto no localStorage quanto no IndexedDB (para imagens pesadas).
 */
export async function saveCompanyProfileLocally(profile: CompanyProfile): Promise<void> {
  if (!profile) return;
  try {
    localStorage.setItem("NUCLEO_COMPANY_PROFILE", JSON.stringify(profile));
  } catch (e) {
    // Se estourar a cota de localStorage por causa de imagem base64 grande, salva sem o logo no localStorage
    // e mantém a integridade dos dados cadastrais
    try {
      const fallback = { ...profile, logo: null };
      localStorage.setItem("NUCLEO_COMPANY_PROFILE", JSON.stringify(fallback));
    } catch (err) {
      console.error("Falha crítica ao gravar perfil no localStorage:", err);
    }
  }

  // Se houver logo, garante persistência no IndexedDB
  if (profile.logo) {
    try {
      const { setIndexedDbItem } = await import("./indexedDb");
      await setIndexedDbItem("NUCLEO_COMPANY_LOGO", profile.logo);
    } catch (err) {
      console.warn("Aviso ao salvar logotipo no IndexedDB:", err);
    }
  }
}

/**
 * Mescla o perfil local com o remoto de forma inteligente:
 * NUNCA apaga dados locais preenchidos se o registro remoto estiver vazio ou nulo!
 */
export function mergeCompanyProfiles(
  local: CompanyProfile,
  remote: Partial<CompanyProfile> | null | undefined
): CompanyProfile {
  if (!remote || typeof remote !== "object") return local;

  const isNonEmpty = (val: any): boolean => {
    return val !== undefined && val !== null && String(val).trim() !== "";
  };

  return {
    tradingName: isNonEmpty(remote.tradingName) ? String(remote.tradingName).trim() : local.tradingName,
    phone: isNonEmpty(remote.phone) ? String(remote.phone).trim() : local.phone,
    cep: isNonEmpty(remote.cep) ? String(remote.cep).trim() : local.cep,
    address: isNonEmpty(remote.address) ? String(remote.address).trim() : local.address,
    number: isNonEmpty(remote.number) ? String(remote.number).trim() : local.number,
    neighborhood: isNonEmpty(remote.neighborhood) ? String(remote.neighborhood).trim() : local.neighborhood,
    city: isNonEmpty(remote.city) ? String(remote.city).trim() : local.city,
    state: isNonEmpty(remote.state) ? String(remote.state).trim() : local.state,
    cnpjCpf: isNonEmpty(remote.cnpjCpf) ? String(remote.cnpjCpf).trim() : local.cnpjCpf,
    logo: isNonEmpty(remote.logo) ? remote.logo! : local.logo,
    pixKey: isNonEmpty(remote.pixKey) ? String(remote.pixKey).trim() : local.pixKey,
    openingTime: isNonEmpty(remote.openingTime) ? remote.openingTime! : local.openingTime,
    closingTime: isNonEmpty(remote.closingTime) ? remote.closingTime! : local.closingTime,
    autoCloseRegisterEnabled: remote.autoCloseRegisterEnabled !== undefined ? remote.autoCloseRegisterEnabled : local.autoCloseRegisterEnabled,
    autoBackupDownloadEnabled: remote.autoBackupDownloadEnabled !== undefined ? remote.autoBackupDownloadEnabled : local.autoBackupDownloadEnabled,
    businessHours: remote.businessHours || local.businessHours,
    cashClosingReminderEnabled: remote.cashClosingReminderEnabled !== undefined ? remote.cashClosingReminderEnabled : local.cashClosingReminderEnabled,
    cashClosingReminderTime: isNonEmpty(remote.cashClosingReminderTime) ? remote.cashClosingReminderTime : local.cashClosingReminderTime,
    cashClosingReminderMessage: isNonEmpty(remote.cashClosingReminderMessage) ? remote.cashClosingReminderMessage : local.cashClosingReminderMessage,
    goalsReminderEnabled: remote.goalsReminderEnabled !== undefined ? remote.goalsReminderEnabled : local.goalsReminderEnabled,
    goalsReminderTime: isNonEmpty(remote.goalsReminderTime) ? remote.goalsReminderTime : local.goalsReminderTime,
  };
}

/**
 * Formata o endereço completo da empresa incluindo todos os campos cadastrados:
 * Logradouro / Rua, Número, Bairro, Cidade / UF e CEP.
 */
export function formatFullCompanyAddress(company?: Partial<CompanyProfile> | null): string {
  if (!company) return "";

  const streetPart = [
    company.address?.trim(),
    company.number?.trim() ? `nº ${company.number.trim()}` : ""
  ].filter(Boolean).join(", ");

  const neighborhoodPart = company.neighborhood?.trim() ? `Bairro ${company.neighborhood.trim()}` : "";

  let cityStatePart = company.city?.trim() || "";
  if (company.state?.trim()) {
    cityStatePart = cityStatePart ? `${cityStatePart}/${company.state.trim().toUpperCase()}` : company.state.trim().toUpperCase();
  }

  const cepPart = company.cep?.trim() ? `CEP ${company.cep.trim()}` : "";

  const parts = [streetPart, neighborhoodPart, cityStatePart, cepPart].filter(Boolean);
  return parts.join(" - ");
}
