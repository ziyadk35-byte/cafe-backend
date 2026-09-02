function initSockets(io) {
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // Branch staff join their branch's room to receive new_order events
    socket.on('join_branch', (branchId) => {
      socket.join(`branch_${branchId}`);
    });

    // Customer joins their own room to receive order status updates
    socket.on('join_customer', (customerId) => {
      socket.join(`customer_${customerId}`);
    });

    // Anyone tracking a specific order (e.g. live tracking screen)
    socket.on('join_order', (orderId) => {
      socket.join(`order_${orderId}`);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
    });
  });
}

module.exports = initSockets;
