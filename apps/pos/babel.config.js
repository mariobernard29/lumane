/**
 * `babel-preset-expo` ya trae lo que el POS necesita: JSX, TypeScript y el
 * plugin de expo-router. No se añade nada más a propósito — cada plugin extra
 * es tiempo en cada recarga y una pieza más que puede romper una actualización
 * de SDK.
 */
module.exports = function (api) {
  api.cache(true)
  return { presets: ['babel-preset-expo'] }
}
