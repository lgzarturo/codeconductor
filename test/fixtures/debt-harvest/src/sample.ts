// This file has deferred items for testing debt-harvest

function processPayment(amount: number) {
  // defer - implement idempotency check --perf
  const result = chargeCard(amount);
  return result;
}

function sendNotification(userId: string, message: string) {
  // defer - add retry logic for transient failures
  // defer: queue messages for batch processing --reliability
  const user = getUser(userId);
  if (user.email) {
    emailService.send(user.email, message);
  }
}

class UserService {
  async findUser(id: string) {
    // defer - add caching layer
    return this.db.query('SELECT * FROM users WHERE id = ?', [id]);
  }

  async updateUser(id: string, data: Partial<User>) {
    // defer: validate input against schema --security
    return this.db.update('users', id, data);
  }
}
