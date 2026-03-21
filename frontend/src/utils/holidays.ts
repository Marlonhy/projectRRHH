/**
 * @file holidays.ts
 * @description Utilidad para calcular festivos en Colombia (incluyendo Ley Emiliani)
 * y festivos regionales de Barranquilla (Carnaval).
 */

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

/**
 * Calcula la fecha de Pascua (Easter) para un año dado usando el algoritmo de Butcher.
 */
function getEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Mueve una fecha al siguiente lunes si no es ya lunes (Ley Emiliani).
 */
function nextMonday(date: Date): Date {
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, ...
  if (day === 1) return date;
  const daysToAdd = (day === 0) ? 1 : (8 - day);
  const result = new Date(date);
  result.setDate(date.getDate() + daysToAdd);
  return result;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Retorna la lista de festivos para un año determinado.
 */
export function getColombianHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [];

  // --- FESTIVOS FIJOS (NO SE MUEVEN) ---
  holidays.push({ date: `${year}-01-01`, name: 'Año Nuevo' });
  holidays.push({ date: `${year}-05-01`, name: 'Día del Trabajo' });
  holidays.push({ date: `${year}-07-20`, name: 'Grito de Independencia' });
  holidays.push({ date: `${year}-08-07`, name: 'Batalla de Boyacá' });
  holidays.push({ date: `${year}-12-08`, name: 'Inmaculada Concepción' });
  holidays.push({ date: `${year}-12-25`, name: 'Navidad' });

  // --- FESTIVOS LEY EMILIANI (SE MUEVEN AL SIGUIENTE LUNES) ---
  const emiliani = [
    { m: 0, d: 6, n: 'Reyes Magos' },
    { m: 2, d: 19, n: 'San José' },
    { m: 5, d: 29, n: 'San Pedro y San Pablo' },
    { m: 7, d: 15, n: 'Asunción de la Virgen' },
    { m: 9, d: 12, n: 'Día de la Raza' },
    { m: 10, d: 1, n: 'Todos los Santos' },
    { m: 10, d: 11, n: 'Independencia de Cartagena' },
  ];

  emiliani.forEach(h => {
    const original = new Date(year, h.m, h.d);
    holidays.push({ date: formatDate(nextMonday(original)), name: h.n });
  });

  // --- FESTIVOS BASADOS EN PASCUA (SEMANA SANTA) ---
  const easter = getEaster(year);
  
  // Jueves Santo (Easter - 3)
  const juevesSanto = new Date(easter);
  juevesSanto.setDate(easter.getDate() - 3);
  holidays.push({ date: formatDate(juevesSanto), name: 'Jueves Santo' });

  // Viernes Santo (Easter - 2)
  const viernesSanto = new Date(easter);
  viernesSanto.setDate(easter.getDate() - 2);
  holidays.push({ date: formatDate(viernesSanto), name: 'Viernes Santo' });

  // --- FESTIVOS BASADOS EN PASCUA QUE SE MUEVEN AL LUNES ---
  // Ascensión del Señor (Easter + 39 -> Siguiente lunes = +43)
  const ascension = new Date(easter);
  ascension.setDate(easter.getDate() + 43);
  holidays.push({ date: formatDate(ascension), name: 'Ascensión del Señor' });

  // Corpus Christi (Easter + 60 -> Siguiente lunes = +64)
  const corpus = new Date(easter);
  corpus.setDate(easter.getDate() + 64);
  holidays.push({ date: formatDate(corpus), name: 'Corpus Christi' });

  // Sagrado Corazón (Easter + 67 -> Siguiente lunes = +71)
  const sagrado = new Date(easter);
  sagrado.setDate(easter.getDate() + 71);
  holidays.push({ date: formatDate(sagrado), name: 'Sagrado Corazón' });

  // --- FESTIVOS REGIONALES (BARRANQUILLA - CARNAVAL) ---
  // Lunes de Carnaval (Easter - 48)
  const lunesCarnaval = new Date(easter);
  lunesCarnaval.setDate(easter.getDate() - 48);
  holidays.push({ date: formatDate(lunesCarnaval), name: 'Lunes de Carnaval (BAQ)' });

  // Martes de Carnaval (Easter - 47)
  const martesCarnaval = new Date(easter);
  martesCarnaval.setDate(easter.getDate() - 47);
  holidays.push({ date: formatDate(martesCarnaval), name: 'Martes de Carnaval (BAQ)' });

  return holidays;
}

/**
 * Verifica si una fecha dada es festiva.
 */
export function isHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const holidays = getColombianHolidays(year);
  const formatted = formatDate(date);
  return holidays.some(h => h.date === formatted);
}
