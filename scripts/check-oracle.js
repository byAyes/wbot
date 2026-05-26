/**
 * 🔍 Oracle Cloud Ampere Availability Checker
 *
 * Uso:
 *   node scripts/check-oracle.js              # Modo interactivo
 *   node scripts/check-oracle.js --browse     # Abre consolas en el navegador
 *
 * Requisitos (opcional):
 *   - OCI CLI instalada y configurada para check automático
 *   - Si no tienes OCI CLI, te guiará manualmente
 */

const { execSync } = require('child_process');
const os = require('os');

// Regiones Always Free con mejor probabilidad
const REGIONS = [
  { code: 'sa-saopaulo-1', name: 'São Paulo', emoji: '🇧🇷', priority: '🥇' },
  { code: 'ap-mumbai-1', name: 'Mumbai', emoji: '🇮🇳', priority: '🥇' },
  { code: 'eu-frankfurt-1', name: 'Frankfurt', emoji: '🇩🇪', priority: '🥈' },
  { code: 'us-sanjose-1', name: 'San José (CR)', emoji: '🇨🇷', priority: '🥈' },
  { code: 'ap-singapore-1', name: 'Singapore', emoji: '🇸🇬', priority: '🥉' },
  { code: 'eu-paris-1', name: 'Paris', emoji: '🇫🇷', priority: '🥉' },
  { code: 'us-ashburn-1', name: 'Ashburn (EE.UU.)', emoji: '🇺🇸', priority: '🥉' },
  { code: 'eu-madrid-1', name: 'Madrid', emoji: '🇪🇸', priority: '🥉' },
];

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(msg, color = '') {
  console.log(`${color}${msg}${COLORS.reset}`);
}

function checkOCICLI() {
  try {
    const version = execSync('oci --version', { encoding: 'utf8', timeout: 5000 }).trim();
    return { installed: true, version };
  } catch {
    return { installed: false, version: null };
  }
}

function getCompartmentId() {
  // Parse the OCI config file directly — faster than listing all compartments
  try {
    const home = os.homedir();
    const configPath = `${home}/.oci/config`;
    const config = require('fs').readFileSync(configPath, 'utf8');
    const match = config.match(/tenancy\s*=\s*([^\r\n]+)/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function checkRegionAvailability(regionCode, compartmentId) {
  try {
    const result = execSync(
      `oci limits resource-availability get ` +
        `--compartment-id "${compartmentId}" ` +
        `--service-name compute ` +
        `--limit-name standard-a1-flex-memory-count ` +
        `--region "${regionCode}"`,
      { encoding: 'utf8', timeout: 15000 },
    );
    const data = JSON.parse(result);
    const available = data.data?.available;
    const used = data.data?.used;
    return { available, used, ok: true };
  } catch (error) {
    const msg = error.stderr || error.message || '';
    if (msg.includes('NotAuthorizedOrNotFound') || msg.includes('404')) {
      return { ok: false, reason: 'No autorizado o región no disponible para tu cuenta' };
    }
    if (msg.includes('Out of capacity') || msg.includes('limit-exceeded')) {
      return { ok: false, reason: 'Sin capacidad' };
    }
    return { ok: false, reason: msg.slice(0, 100) };
  }
}

async function checkViaCLI() {
  log('\n🔍 Verificando disponibilidad con OCI CLI...\n', COLORS.cyan);

  const compartmentId = getCompartmentId();
  if (!compartmentId) {
    log('❌ No se pudo obtener el Compartment ID. Asegúrate de tener la OCI CLI configurada.', COLORS.red);
    return;
  }

  log(`📦 Compartment ID: ${compartmentId.slice(0, 20)}...\n`);

  for (const region of REGIONS) {
    process.stdout.write(`${region.priority} ${region.emoji} ${region.name} (${region.code})... `);

    const result = checkRegionAvailability(region.code, compartmentId);

    if (result.ok && result.available > 0) {
      log(`✅ ${result.available}GB disponibles (usados: ${result.used}GB)`, COLORS.green);
    } else if (result.ok && result.available <= 0) {
      log(`❌ Sin capacidad disponible`, COLORS.red);
    } else {
      log(`⚠️  ${result.reason}`, COLORS.yellow);
    }
  }
}

function showManualGuide() {
  log('\n📋', COLORS.bold + COLORS.cyan);
  log('═'.repeat(55), COLORS.dim);
  log('  GUÍA MANUAL — Probar desde la consola web', COLORS.bold);
  log('═'.repeat(55), COLORS.dim);
  log('');

  for (const region of REGIONS) {
    const url = `https://cloud.oracle.com/compute/instances/create?region=${region.code}`;
    log(`${region.priority} ${region.emoji} ${region.name}:`);
    log(`   ${COLORS.dim}${url}${COLORS.reset}`);
    log('');
  }

  log('📌 PASOS:', COLORS.bold);
  log('1. Abre cada link en una pestaña del navegador');
  log('2. Inicia sesión si es necesario');
  log('3. En Shape selecciona "Ampere" → VM.Standard.A1.Flex');
  log('4. Si ves "Out of capacity", prueba cambiando el Availability Domain');
  log('5. Si te deja crear la instancia → ¡conseguiste! 🎉');
  log('');
}

async function browseRegions(regionsToOpen) {
  const items = regionsToOpen || REGIONS;
  log(`🌐 Abriendo ${items.length} consola(s) de Oracle en el navegador...\n`, COLORS.cyan);

  for (const region of items) {
    const url = `https://cloud.oracle.com/compute/instances/create?region=${region.code}`;
    log(`  Abriendo ${region.emoji} ${region.name}...`);
    try {
      if (os.platform() === 'win32') {
        execSync(`start "" "${url}"`, { timeout: 2000 });
      } else if (os.platform() === 'darwin') {
        execSync(`open "${url}"`, { timeout: 2000 });
      } else {
        execSync(`xdg-open "${url}"`, { timeout: 2000 });
      }
    } catch {
      log(`  ${COLORS.yellow}No se pudo abrir el navegador. Link: ${url}${COLORS.reset}`);
    }
  }
}

async function main() {
  log('');
  log('╔' + '═'.repeat(50) + '╗', COLORS.cyan);
  log('║' + '   🔍 Oracle Cloud Ampere Availability Checker'.padEnd(49) + '║', COLORS.cyan + COLORS.bold);
  log('╚' + '═'.repeat(50) + '╝', COLORS.cyan);
  log('');

  const args = process.argv.slice(2);

  if (args.includes('--browse') || args.includes('-b')) {
    await browseRegions(REGIONS);
    showManualGuide();
    return;
  }

  if (args.includes('--top') || args.includes('-t')) {
    // Only open top 2 regions (São Paulo & Mumbai)
    await browseRegions(REGIONS.slice(0, 2));
    showManualGuide();
    return;
  }

  const oci = checkOCICLI();

  if (oci.installed) {
    log(`✅ OCI CLI detectada: ${oci.version}\n`, COLORS.green);
    await checkViaCLI();
  } else {
    log('⚠️  OCI CLI no detectada. Usando modo guía manual.\n', COLORS.yellow);
    log('💡 Para check automático: https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm', COLORS.dim);
  }

  showManualGuide();

  log('');
  log('💡 TIP:', COLORS.bold + COLORS.yellow);
  log('   Prueba primero São Paulo o Mumbai: tienen más disponibilidad.');
  log('   Intenta en horas de baja demanda (3-5 AM hora local).');
  log('   Cambia el Availability Domain si ves "Out of capacity".');
  log('');
  log(`📖 Uso rápido:
  node scripts/check-oracle.js --browse   # Abrir TODAS las regiones
  node scripts/check-oracle.js --top      # Solo São Paulo y Mumbai
  node scripts/check-oracle.js            # Modo CLI + guía manual`);
  log('');
}

main().catch(console.error);
