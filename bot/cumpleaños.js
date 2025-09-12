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
async function guardarCumpleaños(message) {
    const body = message.body.trim();
    const parts = body.split(' ');

    if (parts.length !== 2) {
        return message.reply('Formato incorrecto. Usa: .bd DD-MM-YYYY');
    }

    const dateString = parts[1];
    const dateParts = dateString.split('-');

    if (dateParts.length !== 3) {
        return message.reply('Formato de fecha incorrecto. Usa: DD-MM-YYYY');
    }

    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const year = parseInt(dateParts[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) {
        return message.reply('La fecha contiene caracteres no válidos. Usa: DD-MM-YYYY');
    }

    // Validaciones básicas de fecha
    if (month < 1 || month > 12) {
        return message.reply('El mes debe estar entre 1 y 12.');
    }
    if (day < 1 || day > 31) { // Simplificado, se puede mejorar con lógica de días por mes
        return message.reply('El día no es válido.');
    }

    ensureBirthdaysFile();

    try {
        const birthdaysData = JSON.parse(fs.readFileSync(birthdaysFilePath, 'utf8'));
        const userId = message.from;
        const contact = await message.getContact();
        const mention = `@${contact.id.user}`;

        const monthName = getMonthName(month);

        const existingEntryIndex = birthdaysData.findIndex(entry => entry.userId === userId);

        if (existingEntryIndex !== -1) {
            // Actualizar cumpleaños existente
            birthdaysData[existingEntryIndex].birthday = dateString;
            birthdaysData[existingEntryIndex].month = monthName;
            birthdaysData[existingEntryIndex].mention = mention;
            message.reply(`He actualizado tu fecha de cumpleaños a: ${day} de ${monthName} de ${year}.`);
        } else {
            // Agregar nuevo cumpleaños
            birthdaysData.push({ userId, mention, birthday: dateString, month: monthName });
            message.reply(`¡He guardado tu cumpleaños! ${mention}, te recordaré el ${day} de ${monthName}.`);
        }

        fs.writeFileSync(birthdaysFilePath, JSON.stringify(birthdaysData, null, 2), 'utf8');

    } catch (error) {
        console.error('Error al guardar el cumpleaños:', error);
        message.reply('Hubo un error al guardar tu cumpleaños. Por favor, inténtalo de nuevo.');
    }
}

// Función para mostrar todos los cumpleaños
async function mostrarCumpleaños(message, client) {
    ensureBirthdaysFile();

    try {
        const birthdaysData = JSON.parse(fs.readFileSync(birthdaysFilePath, 'utf8'));

        if (birthdaysData.length === 0) {
            return message.reply('Todavía no hay cumpleaños guardados.');
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
        
        const birthdayPromises = birthdaysWithRemainingDays.map(async (entry) => {
            const birthdayParts = entry.birthday.split('-');
            const day = birthdayParts[0];
            const month = getMonthName(parseInt(birthdayParts[1], 10));
            
            let name = entry.mention; // fallback
            try {
                const contact = await client.getContactById(entry.userId);
                if (contact) {
                    name = contact.pushname || contact.name || entry.mention;
                }
            } catch (error) {
                console.error(`Could not get contact for ${entry.userId}`, error);
            }
            
            return `🎁 ${name} - *${day} de ${month}* (Faltan ${entry.remainingDays} días)`;
        });

        const birthdayLines = await Promise.all(birthdayPromises);
        response += birthdayLines.join('\n');

        message.reply(response);

    } catch (error) {
        console.error('Error al mostrar los cumpleaños:', error);
        message.reply('Hubo un error al mostrar los cumpleaños. Por favor, inténtalo de nuevo.');
    }
}

module.exports = { guardarCumpleaños, mostrarCumpleaños };
