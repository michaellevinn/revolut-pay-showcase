import { useState } from 'react';
import axios from 'axios';
import RevolutCheckout from '@revolut/checkout'

const STANDARD_ITEMS = [
    { id: 1, name: 'Premium Subscription', desc: 'Access to premium features', price: 49.99, type: 'service' },
    { id: 2, name: 'Personal Consultation', desc: '30-min expert consultation', price: 35.00, type: 'service' },
];

const TEST_ITEMS = [
    { id: 3, name: 'Test: Decline (No Reason)', desc: 'Triggers decline without reason', price: 10.01, type: 'service' },
    { id: 4, name: 'Test: Insufficient Funds', desc: 'Triggers insufficient funds error', price: 10.02, type: 'service' },
    { id: 5, name: 'Test: Suspected Fraud', desc: 'Triggers suspected fraud error', price: 10.03, type: 'service' },
    { id: 6, name: 'Test: Exceeded Limit', desc: 'Triggers withdrawal limit error', price: 10.04, type: 'service' },
    { id: 7, name: 'Test: Do Not Honour', desc: 'Triggers do not honour error', price: 10.05, type: 'service' },
];

function App() {
    const [currency, setCurrency] = useState('GBP');
    const [cart, setCart] = useState([]);
    const [isOrderConfirmed, setIsOrderConfirmed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [paymentStatus, setPaymentStatus] = useState('idle'); // idle, success, error
    const [paymentToken, setPaymentToken] = useState(null)
    const [orderId, setOrderId] = useState(null) // Add state for Order ID

    // Custom item state
    const [customPrice, setCustomPrice] = useState('');

    const addToCart = (item) => {
        if (isOrderConfirmed) return;
        setCart([...cart, { ...item, uniqueId: Date.now() + Math.random() }]);
    };

    const addCustomItem = () => {
        if (isOrderConfirmed || !customPrice) return;
        const price = parseFloat(customPrice);
        if (isNaN(price) || price <= 0) return;

        addToCart({
            id: 'custom',
            name: 'Custom Amount',
            desc: 'User defined',
            price: price,
            type: 'service'
        });
        setCustomPrice('');
    };

    const [paymentsInstance, setPaymentsInstance] = useState(null);

    const resetOrder = () => {
        if (paymentsInstance) {
            try {
                if (typeof paymentsInstance.destroy === 'function') {
                    paymentsInstance.destroy();
                }
            } catch (e) {
                console.warn('Error destroying instance', e);
            }
        }
        setPaymentsInstance(null);
        setCart([]);
        setIsOrderConfirmed(false);
        setMessage('');
        setPaymentStatus('idle');
        setOrderId(null);
    };

    const totalAmount = cart.reduce((sum, item) => sum + item.price, 0);

    // Helper function to generate Order ID: SC-XX-0000
    const generateOrderId = () => {
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const getRandomLetter = () => letters.charAt(Math.floor(Math.random() * letters.length));
        const randomLetters = getRandomLetter() + getRandomLetter();
        const randomNumbers = Math.floor(1000 + Math.random() * 9000); // Ensures 4 digits
        return `SC-${randomLetters}-${randomNumbers}`;
    };

    const handleConfirmOrder = async () => {
        if (cart.length === 0) return;
        setLoading(true);
        setMessage('');
        setPaymentStatus('idle');

        const newOrderId = generateOrderId();
        setOrderId(newOrderId);

        try {
            // Prepare line items in the format required by Revolut API
            const lineItems = cart.map(item => ({
                name: item.name,
                description: item.desc || item.name,
                type: item.type || 'service',
                quantity: {
                    value: 1
                },
                unit_price_amount: Math.round(item.price * 100),
                total_amount: Math.round(item.price * 100)
            }));

            // 1. Get the token from the server side
            const response = await axios.post('/api/payment/create-order', {
                amount: Math.round(totalAmount * 100),
                currency,
                line_items: lineItems,
                merchantOrderData: {
                    reference: newOrderId,
                },
            });
            const token = response.data.token;
            const publicKey = response.data.publicKey;

            // 2. Initialize the SDK
            const instance = await RevolutCheckout.payments({
                locale: 'en',
                publicToken: publicKey,
                mode: 'sandbox'
            });

            setPaymentsInstance(instance);
            setIsOrderConfirmed(true);

            // Wait for React to render the div container
            setTimeout(async () => {
                const container = document.getElementById('revolut-pay');
                if (!container) {
                    setMessage('Error: Payment container not found');
                    return;
                }
                container.innerHTML = '';

                // 3. Mount the widget
                instance.revolutPay.mount(container, {
                    currency: currency,
                    totalAmount: Math.round(totalAmount * 100),
                    merchantOrderData: {
                        reference: newOrderId,
                    },
                    buttonStyle: { radius: 'small' },
                    lineItems: cart.map(item => ({
                        name: item.name,
                        totalAmount: Math.round(item.price * 100),
                        unitPriceAmount: Math.round(item.price * 100),
                        quantity: { value: 1 },
                        description: item.desc || item.name,
                        type: item.type || 'physical'
                    })),
                    createOrder: async () => {
                        return { publicId: token };
                    }
                });
                // Widget .on events logic
                instance.revolutPay.on('payment', (event) => {
                    switch (event.type) {
                        case 'cancel': {
                            if (event.dropOffState === 'payment_summary') {
                                setMessage('Payment Cancelled at summary');
                            } else {
                                setMessage('Payment Cancelled');
                            }
                            setPaymentStatus('error');
                            break;
                        }
                        case 'success':
                            setMessage('Payment Successful!');
                            setPaymentStatus('success');
                            break;
                        case 'error':
                            setMessage((event.error ? event.error.message : 'Unknown error'));
                            setPaymentStatus('error');
                            break;
                    }
                });
            }, 100);

        } catch (error) {
            console.error(error);
            setMessage('Error: ' + error.message);
            setIsOrderConfirmed(false);
        } finally {
            setLoading(false);
        }
    };

    // Build the page
    return (
        <div className="min-h-screen bg-gray-900 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
            <div className="max-w-4xl w-full bg-gray-50 rounded-2xl shadow-xl p-8 space-y-8">

                {/* 1. Header & Currency */}
                <div className="flex justify-between items-center border-b border-gray-200 pb-6">
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Showcase Order</h2>
                    <div className="flex items-center space-x-3 bg-gray-50 p-2 rounded-lg">
                        <label htmlFor="currency" className="text-sm font-medium text-gray-600 pl-2">Currency</label>
                        <select
                            id="currency"
                            disabled={isOrderConfirmed || cart.length > 0}
                            className="block w-32 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                        >
                            <option value="GBP">GBP</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">

                    {/* 2. Items List */}
                    <div className={`space-y-6 ${isOrderConfirmed ? 'opacity-50 pointer-events-none' : ''}`}>

                        {/* Section 1: Standard Items */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Products & Services</h3>
                            <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-200">
                                {STANDARD_ITEMS.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => addToCart(item)}
                                        className="p-4 hover:bg-gray-50 cursor-pointer flex justify-between items-center transition group bg-white"
                                    >
                                        <div>
                                            <div className="flex items-center space-x-2">
                                                <div className="text-sm font-medium text-gray-900 group-hover:text-indigo-600 transition-colors">{item.name}</div>
                                            </div>
                                            <div className="text-xs text-gray-500">{item.desc}</div>
                                        </div>
                                        <div className="text-sm font-semibold text-gray-900">
                                            {currency} {item.price.toFixed(2)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Section 2: Test Items */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Simulate Errors (Sandbox)</h3>
                            <div className="bg-gray-50 rounded-lg border-l-4 border-t border-r border-b border-gray-200 overflow-hidden divide-y divide-gray-200">
                                {TEST_ITEMS.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => addToCart(item)}
                                        className="p-4 hover:bg-amber-50 cursor-pointer flex justify-between items-center transition group bg-white"
                                    >
                                        <div>
                                            <div className="flex items-center space-x-2">
                                                <div className="text-sm font-medium text-gray-900 group-hover:text-amber-700 transition-colors">{item.name}</div>
                                            </div>
                                            <div className="text-xs text-gray-500">{item.desc}</div>
                                        </div>
                                        <div className="text-sm font-semibold text-gray-900">
                                            {currency} {item.price.toFixed(2)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Section 3: Custom Amount */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Custom Payment</h3>
                            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex items-center justify-between gap-4">
                                <div className="flex-1">
                                    <div className="text-sm font-medium text-gray-900">Custom Amount</div>
                                    <div className="mt-1 relative rounded-md shadow-sm">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <span className="text-gray-500 sm:text-sm">{currency}</span>
                                        </div>
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-12 pr-12 sm:text-sm border-gray-300 rounded-md border p-2"
                                            value={customPrice}
                                            onChange={(e) => setCustomPrice(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addCustomItem()}
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={addCustomItem}
                                    disabled={!customPrice}
                                    className="self-end mb-[2px] inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:bg-gray-300"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 3. Order Summary & Payment */}
                    <div className="space-y-6">
                        {/* Order Details Block */}
                        <div className={`bg-gray-50 border border-gray-200 rounded-xl p-6 transition-all ${isOrderConfirmed ? 'opacity-70 pointer-events-none' : ''}`}>
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Current Order</h3>
                                    {orderId && <p className="text-xs text-gray-500 font-mono mt-1">ID: {orderId}</p>}
                                </div>
                                {isOrderConfirmed && (
                                    <button
                                        onClick={resetOrder}
                                        className="pointer-events-auto inline-flex items-center px-2 py-1 border border-red-300 text-xs font-medium rounded text-red-700 bg-white hover:bg-red-50 focus:outline-none"
                                    >
                                        Reset Order
                                    </button>
                                )}
                            </div>

                            {cart.length === 0 ? (
                                <div className="text-center py-6 text-gray-500 text-sm">Cart is empty</div>
                            ) : (
                                <ul className="divide-y divide-gray-200 mb-4">
                                    {cart.map((item) => (
                                        <li key={item.uniqueId} className="py-3 flex justify-between items-center">
                                            <div>
                                                <div className="text-sm font-medium text-gray-900">{item.name}</div>
                                                <div className="text-xs text-gray-500 capitalize">{item.type}</div>
                                            </div>
                                            <span className="text-sm font-medium text-gray-900">{currency} {item.price.toFixed(2)}</span>
                                        </li>
                                    ))}
                                    <li className="py-3 flex justify-between border-t border-gray-200 font-bold">
                                        <span>Total</span>
                                        <span>{currency} {totalAmount.toFixed(2)}</span>
                                    </li>
                                </ul>
                            )}

                            {!isOrderConfirmed && (
                                <button
                                    onClick={handleConfirmOrder}
                                    disabled={loading || cart.length === 0}
                                    className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:bg-gray-300 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Processing...' : 'Confirm Order'}
                                </button>
                            )}
                        </div>

                        {/* Separate Payment Block */}
                        {isOrderConfirmed && (
                            <div className="bg-white shadow-lg rounded-xl p-8 animate-fade-in border-2 border-indigo-100 ring-4 ring-indigo-50/50">
                                <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">Payment Method</h3>
                                <div className="space-y-4">
                                    {paymentStatus === 'success' ? (
                                        <div className="text-center py-8 animate-fade-in-up">
                                            <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-green-100 mb-6 shadow-sm">
                                                <svg className="h-10 w-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <h3 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h3>
                                            <p className="text-gray-500">Thank you for your order. A confirmation email has been sent.</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center">
                                            {paymentStatus === 'error' && message ? (
                                                <div className="text-center mb-6 w-full bg-red-50 rounded-lg p-6 border border-red-100">
                                                    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                                                        <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </div>
                                                    <h3 className="text-lg font-bold text-red-900 mb-1">Payment Failed</h3>
                                                    <p className="text-sm text-red-600 mb-4">{message}</p>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Please Try Again</p>
                                                </div>
                                            ) : (
                                                <div className="text-center text-sm text-gray-500 mb-4 font-medium">
                                                    Securely pay with Revolut Pay
                                                </div>
                                            )}

                                            <div id="revolut-pay" className="w-full flex justify-center min-h-[50px]"></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Message block for errors before confirmation */}
                        {!isOrderConfirmed && message && (
                            <div className={`mt-4 text-center text-sm ${message.includes('Error') || message.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                                {message}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    )
}

export default App
