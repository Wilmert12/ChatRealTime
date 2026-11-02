using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using SignalR.Shared.Contracts;

namespace SignalR.HubServer.Hubs;

public sealed class ChatHub
    : Microsoft.AspNetCore.SignalR.Hub
{
    private static readonly HashSet<string> ValidRooms =
        new(StringComparer.Ordinal)
        {
            "Desarrollo", "Diseño"
        };

    
    private static readonly ConcurrentDictionary<string, string> Rooms = new();

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        
        Rooms.TryRemove(Context.ConnectionId, out _);
        return base.OnDisconnectedAsync(exception);
    }

    public async Task JoinRoom(string room)
    {
        if (string.IsNullOrWhiteSpace(room) || !ValidRooms.Contains(room))
        {
            throw new HubException("La sala indicada no existe.");
        }

        if (Rooms.TryGetValue(Context.ConnectionId, out var current)
            && current != room)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, current);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, room);
        Rooms[Context.ConnectionId] = room;
    }

    public async Task SendMessage(
        string user, string message)
    {
        if (string.IsNullOrWhiteSpace(user) ||
            string.IsNullOrWhiteSpace(message))
        {
            throw new HubException(
                "El usuario y el mensaje son obligatorios.");
        }

        user = user.Trim();
        message = message.Trim();

        if (user.Length > 40 || message.Length > 1000)
        {
            throw new HubException(
                "El mensaje supera el límite permitido.");
        }

        
        if (!Rooms.TryGetValue(Context.ConnectionId, out var room))
        {
            throw new HubException(
                "Primero debes unirte a una sala.");
        }

        var chatMessage = new ChatMessage(
            user,
            message,
            DateTimeOffset.UtcNow);

        await Clients.Group(room).SendAsync(
            "ReceiveMessage",
            chatMessage);
    } 
} 
