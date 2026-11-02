namespace SignalR.Shared.Contracts;

public sealed record ChatMessage(
    string User,
    string Message,
    DateTimeOffset SentAt);
