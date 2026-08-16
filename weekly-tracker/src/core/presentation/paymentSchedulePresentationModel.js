import{calculatePaymentSchedule}from'../../engines/paymentScheduleEngine.js';export function buildPaymentSchedulePresentation(rows,award){return calculatePaymentSchedule(rows,award?.contractValue)}
