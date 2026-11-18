/* A booking partner's live price widget for each hotel's card (the owner's choice, 18 Nov: option 2).
 *
 * Empty: no widget; each card still links to Booking.com and Google Maps. To switch it on, join a booking site's
 * affiliate programme, create a hotel price (or search) widget in its dashboard, and paste the widget's link below.
 * The link may use these placeholders, filled in for each hotel: {name} {lat} {lng} {checkin} {checkout} {lang}
 * (checkin is two weeks ahead, one night). Only https links are used. Nothing from the partner loads until a
 * visitor taps "Show live prices": their prices are theirs, shown in their own panel, never stored by this site.
 */
window.PRICE_WIDGET = {
  partner: '',  // the partner's name as shown on the button, e.g. 'Booking.com'
  url: ''       // e.g. 'https://partner.example/widget?aid=YOUR_ID&ss={name}&checkin={checkin}&checkout={checkout}&lang={lang}'
};
