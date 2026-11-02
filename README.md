# Práctica guiada · SignalR + .NET 10

## Ejecutar

```powershell
.\run-all.ps1
```

Abre **`https://localhost:7002`** (no el 56004). Hub en `https://localhost:7001`.

Bootstrap 5.3.3 y `signalr.min.js` (8.0.7) ya vienen **dentro del proyecto**
(`SignalR.Client/wwwroot/lib/bootstrap` y `wwwroot/js/signalr`): no necesitas internet ni
`libman restore`.

---

## 1. Mostrar la hora

`sentAt` llega en UTC como texto ISO. En `chat.js`:

```js
const time = new Date(message.sentAt).toLocaleTimeString();
addLine(`[${time}] ${message.user}: ${message.message}`);
```

`toLocaleTimeString()` convierte a la hora local del navegador.

**Prueba:** envía un mensaje; debe verse `[10:42:05] Ana: Hola`.

---

## 2. Validar mensajes

Hay dos capas:

| Capa | Dónde | Para qué |
|---|---|---|
| Navegador | `maxlength` y el `if (!user || !message)` | Comodidad del usuario. **Se puede saltar.** |
| Servidor | `ChatHub.SendMessage` (`HubException`) | La que realmente protege. |

Como `maxlength` impide escribir de más, para probar el servidor hay que saltarse el
navegador. Con la página abierta, pulsa **F12 → Console** y ejecuta:

```js
connection.invoke("SendMessage", "", "hola")                  // usuario vacío
connection.invoke("SendMessage", "Ana", "   ")                // mensaje en blanco
connection.invoke("SendMessage", "x".repeat(41), "hola")      // nombre de 41 caracteres
connection.invoke("SendMessage", "Ana", "y".repeat(1001))     // mensaje de 1001 caracteres
```

Cada una debe fallar con el mensaje del servidor (por ejemplo "El mensaje supera el
límite permitido."), que también se muestra en rojo bajo el botón.

**Respuesta (por qué validar en el servidor):** el navegador lo controla el usuario;
cualquiera puede abrir la consola o llamar al Hub con otra herramienta. Todo lo que
llega del cliente es entrada no confiable.

---

## 3. Investigar reconexiones

La **insignia de la barra superior** cambia de color según el estado (verde Conectado,
amarillo Reconectando, rojo Desconectado). Los cambios también se imprimen en la consola
del navegador (F12).

**Experimento:**
1. Con el chat conectado, detén el Hub (`Ctrl+C` en su terminal).
2. Observa: `Reconectando...` y el botón Enviar se deshabilita.
3. Reinicia el Hub **antes de 40 s** → vuelve a `Conectado`.
4. Repite, pero espera **más de ~45 s** antes de reiniciar.

**Qué ocurre y por qué:**

- `withAutomaticReconnect()` reintenta a los **0, 2, 10 y 30 s**. Si el servidor vuelve
  en ese tiempo, la conexión **se recupera sola**.
- Pasados esos reintentos, la conexión pasa a `Disconnected`, se dispara `onclose` y
  **ya no se recupera sola**: hay que llamar otra vez a `start()`.
- Tampoco cubre un **fallo inicial**: si el Hub está apagado al cargar la página,
  `start()` falla una vez y no reintenta.
- La reconexión crea un **connectionId nuevo**: se pierde el estado ligado a la
  conexión (por ejemplo la sala; el cliente la vuelve a pedir) y los mensajes enviados mientras estuvo caída **no se
  recuperan**.

**Mejora incluida** (`RETRY_AFTER_CLOSE = true` en `chat.js`): al cerrarse o fallar el
arranque, reintenta cada 5 s, y al reconectar vuelve a unirse a la sala elegida. Pon
`RETRY_AFTER_CLOSE = false` para ver el comportamiento "de fábrica".

---

## 4. Salas con grupos

Lista **Salas** (izquierda): **Desarrollo** y **Diseño**. No hay sala general: hay que elegir una para poder escribir.

**Diseño:**

```
Cliente ──► ChatHub ──► Grupo "Desarrollo"
                    └─► Grupo "Diseño"
```

- `Groups.AddToGroupAsync(connectionId, sala)` mete la conexión en un grupo;
  `RemoveFromGroupAsync` la saca.
- `Clients.Group(sala).SendAsync(...)` envía **solo** a los miembros de ese grupo.
- El Hub guarda `connectionId → sala` y `SendMessage` envía a la sala que el **servidor**
  tiene registrada: el navegador no puede elegir otra sala escribiendo en la consola.
- Una conexión nueva **no está en ninguna sala** hasta que elige una; si intenta enviar
  sin sala, el servidor responde "Primero debes unirte a una sala.". SignalR saca a la
  conexión de sus grupos al desconectarse.
- El servidor valida que la sala exista (lista `ValidRooms`).

**Prueba:** abre 3 pestañas. A y B en *Desarrollo*, C en *Diseño*. Un mensaje de A lo ven
A y B, **no** C. Después pasa B a *Diseño*: ya no recibe los de A.

**Cuándo `Clients.All` y cuándo un grupo:** `All` para avisos globales (mantenimiento,
anuncios). Un grupo cuando solo debe enterarse un subconjunto (sala, equipo, pedido).

**Límite de este ejemplo:** cualquiera puede entrar a cualquier sala. En producción cada
`JoinRoom` debería comprobar que el usuario autenticado tiene permiso.

---

## 5. Notificar a un usuario (`Clients.User`)

`Clients.User("id")` envía a **todas las conexiones** cuyo `Context.UserIdentifier` sea
ese id (un usuario puede tener varias pestañas o dispositivos).

**Qué debe implementar el servidor para identificar al destinatario de forma confiable:**

1. **Autenticación real** (JWT, cookies u OpenID Connect). Sin ella,
   `Context.UserIdentifier` es `null` y `Clients.User` no llega a nadie.
2. **Middleware en orden** y Hub protegido:

   ```csharp
   builder.Services.AddAuthentication(/* JWT Bearer */).AddJwtBearer(/* ... */);
   builder.Services.AddAuthorization();
   // ...
   app.UseAuthentication();
   app.UseAuthorization();
   app.MapHub<ChatHub>("/chatHub");   // y [Authorize] en la clase del Hub
   ```
3. **Que el token llegue al Hub.** En el navegador:
   `.withUrl(url, { accessTokenFactory: () => token })`. Con WebSockets el token viaja
   en la query string, y el servidor debe leerlo (`OnMessageReceived`) para rutas `/chatHub`.
4. **Identificador estable:** por defecto SignalR usa el claim `NameIdentifier`. Si tu
   identificador es otro (correo, GUID propio), implementa `IUserIdProvider`.
5. **Resolver el destinatario en el servidor**, p. ej. por su id de base de datos, y no
   confiar en un nombre escrito en el formulario (cualquiera puede escribir "Ana").
6. **Autorizar la acción:** comprobar que el remitente puede escribirle a ese usuario.

Ejemplo de la llamada, ya con identidad verificada:

```csharp
public async Task SendPrivate(string recipientId, string message)
{
    var sender = Context.UserIdentifier;            // viene del token, no del cliente
    await Clients.User(recipientId).SendAsync("ReceivePrivate", sender, message);
}
```

**Pista del taller:** *piensa en autenticación, no en el nombre escrito.* El nombre del
formulario es solo texto del navegador; la identidad la prueba el servidor.

---

## Problemas frecuentes

| Síntoma | Causa y arreglo |
|---|---|
| "Error de conexión" | Hub apagado o no está en 7001. |
| Error de CORS | El cliente no está en `https://localhost:7002`. |
| `signalR is not defined` | Falta `signalr.min.js` (`libman restore`). |
| Aviso de certificado | `dotnet dev-certs https --trust` y reinicia. |
