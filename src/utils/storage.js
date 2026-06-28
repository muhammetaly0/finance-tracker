export const loadData = () => {
  try {
    const data = localStorage.getItem("financeData");
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const saveData = (data) => {
  localStorage.setItem("financeData", JSON.stringify(data));
};