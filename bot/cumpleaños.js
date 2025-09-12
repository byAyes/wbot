const fs = require('fs');
const path = require('path');

const birthdaysFilePath = path.join(__dirname, '..', 'birthdays.json');

// Función para asegurar que el archivo JSON exista
function ensureBirthdaysFile() {
    if (!fs.existsSync(birthdaysFilePath)) {
        fs.writeFileSync(birthdaysFilePath, JSON.stringify([]), 'utf8');
    }
}

// Función para convertir número de mes a nombre
function getMonthName(monthNumber) {
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return months[monthNumber - 1];
}

// Función para guardar un cumpleaños
async function guardarCumpleaños(msg, sock) {
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const parts = body.trim().split(' ');

    if (parts.length !== 2) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'Formato incorrecto. Usa: .bd DD-MM-YYYY' }, { quoted: msg });
    }

    const dateString = parts[1];
    const dateParts = dateString.split('-');

    if (dateParts.length !== 3) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'Formato de fecha incorrecto. Usa: DD-MM-YYYY' }, { quoted: msg });
    }

    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const year = parseInt(dateParts[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'La fecha contiene caracteres no válidos. Usa: DD-MM-YYYY' }, { quoted: msg });
    }

    // Validaciones básicas de fecha
    if (month < 1 || month > 12) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'El mes debe estar entre 1 y 12.' }, { quoted: msg });
    }
    if (day < 1 || day > 31) { // Simplificado, se puede mejorar con lógica de días por mes
        return sock.sendMessage(msg.key.remoteJid, { text: 'El día no es válido.' }, { quoted: msg });
    }

    ensureBirthdaysFile();

    try {
        const birthdaysData = JSON.parse(fs.readFileSync(birthdaysFilePath, 'utf8'));
        const userId = msg.key.remoteJid;
        const mention = `@${userId.split('@')[0]}`;

        const monthName = getMonthName(month);

        const existingEntryIndex = birthdaysData.findIndex(entry => entry.userId === userId);

        if (existingEntryIndex !== -1) {
            // Actualizar cumpleaños existente
            birthdaysData[existingEntryIndex].birthday = dateString;
            birthdaysData[existingEntryIndex].month = monthName;
            birthdaysData[existingEntryIndex].mention = mention;
            await sock.sendMessage(msg.key.remoteJid, { text: `He actualizado tu fecha de cumpleaños a: ${day} de ${monthName} de ${year}.` }, { quoted: msg });
        } else {
            // Agregar nuevo cumpleaños
            birthdaysData.push({ userId, mention, birthday: dateString, month: monthName });
            await sock.sendMessage(msg.key.remoteJid, { text: `¡He guardado tu cumpleaños! ${mention}, te recordaré el ${day} de ${monthName}.` }, { quoted: msg });
        }

        fs.writeFileSync(birthdaysFilePath, JSON.stringify(birthdaysData, null, 2), 'utf8');

    } catch (error) {
        console.error('Error al guardar el cumpleaños:', error);
        await sock.sendMessage(msg.key.remoteJid, { text: 'Hubo un error al guardar tu cumpleaños. Por favor, inténtalo de nuevo.' }, { quoted: msg });
    }
}

// Función para mostrar todos los cumpleaños
async function mostrarCumpleaños(msg, sock) {
    ensureBirthdaysFile();

    try {
        const birthdaysData = JSON.parse(fs.readFileSync(birthdaysFilePath, 'utf8'));

        if (birthdaysData.length === 0) {
            return sock.sendMessage(msg.key.remoteJid, { text: 'Todavía no hay cumpleaños guardados.' }, { quoted: msg });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const birthdaysWithRemainingDays = birthdaysData.map(entry => {
            const birthDateParts = entry.birthday.split('-');
            const birthDay = parseInt(birthDateParts[0], 10);
            const birthMonth = parseInt(birthDateParts[1], 10) - 1;

            let nextBirthday = new Date(today.getFullYear(), birthMonth, birthDay);
            if (nextBirthday < today) {
                nextBirthday.setFullYear(today.getFullYear() + 1);
            }

            const diffTime = nextBirthday - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return { ...entry, remainingDays: diffDays };
        });

        birthdaysWithRemainingDays.sort((a, b) => a.remainingDays - b.remainingDays);

        let response = '🎂 *Próximos Cumpleaños* 🎂\n\n';
        birthdaysWithRemainingDays.forEach(entry => {
            const birthdayParts = entry.birthday.split('-');
            const day = birthdayParts[0];
            const month = getMonthName(parseInt(birthdayParts[1], 10));
            response += `🎁 ${entry.mention} - *${day} de ${month}* (Faltan ${entry.remainingDays} días)\n`;
        });

        await sock.sendMessage(msg.key.remoteJid, { text: response }, { quoted: msg });

    } catch (error) {
        console.error('Error al mostrar los cumpleaños:', error);
        await sock.sendMessage(msg.key.remoteJid, { text: 'Hubo un error al mostrar los cumpleaños. Por favor, inténtalo de nuevo.' }, { quoted: msg });
    }
}

module.exports = { guardarCumpleaños, mostrarCumpleaños };