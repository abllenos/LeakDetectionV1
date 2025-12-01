import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 0,
    marginBottom: 80, // add space above the wave
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e3a5f',
    textAlign: 'center',
    letterSpacing: 1,
  },
  statusContainer: {
    marginTop: 30,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  statusIcon: {
    fontSize: 24,
    color: '#10b981',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  waveContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    overflow: 'hidden',
    zIndex: 1,
  },
  waveLayer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    height: 200,
  },
  wave: {
    position: 'absolute',
    bottom: 0,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    width: '100%',
    alignItems: 'center',
    zIndex: 10,
  },
  footerText: {
    fontSize: 12,
    color: '#1e3a5f',
    fontWeight: '600',
  },
  versionText: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
});
