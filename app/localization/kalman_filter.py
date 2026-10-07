"""
Stage 2: Discrete Kinematic Constant Velocity (CV) Kalman Filter Tracker
with Adaptive Process Noise Q_k (Pedestrian vs Vehicular Maneuvering Adaptivity).

Dynamically scales Process Noise Q_k when the suspect accelerates or changes direction,
and scales Measurement Noise R_k based on GDOP + Stage 1 residual RMS error.

Ported from my_local_work/code/kalman_filter.py.
"""

from typing import Optional
import numpy as np


class KalmanTracker:
    """
    Constant-velocity Kalman filter with adaptive noise tuning.
    """

    def __init__(
        self,
        dt: float = 1.0,
        process_noise_std: float = 0.5,
        base_measurement_std: float = 25.0,
        target_type: str = "pedestrian",
    ):
        """
        :param dt: Time sampling interval in seconds.
        :param process_noise_std: Base std dev of suspect acceleration fluctuations (m/s^2).
        :param base_measurement_std: Nominal std dev of Stage 1 position measurement (meters).
        :param target_type: "pedestrian" (~1-2 m/s^2 acceleration) or "vehicle" (~3-5 m/s^2 acceleration).
        """
        self.dt = dt
        self.base_measurement_std = base_measurement_std
        self.target_type = target_type

        # Base process noise variance based on suspect target type
        self.base_q_var = (0.3 ** 2) if target_type == "pedestrian" else (1.5 ** 2)

        # State vector x = [pos_x, pos_y, vel_x, vel_y]^T
        self.x = np.zeros((4, 1), dtype=np.float64)

        # State Transition Matrix F
        self.F = np.array([
            [1.0, 0.0, dt, 0.0],
            [0.0, 1.0, 0.0, dt],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ], dtype=np.float64)

        # Measurement Matrix H (observes pos_x, pos_y)
        self.H = np.array([
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
        ], dtype=np.float64)

        # Base Measurement Noise Covariance R_base
        self.R_base = np.eye(2, dtype=np.float64) * (base_measurement_std ** 2)

        self.P = np.eye(4, dtype=np.float64) * 500.0
        self._initialized = False
        self._first_update = True

    @property
    def predicted_position(self) -> Optional[np.ndarray]:
        """
        Returns the a-priori predicted [x, y] position for the current state.
        """
        if not self._initialized:
            return None
        return (self.F @ self.x)[:2].flatten()

    def _get_process_noise_Q(self, q_var: float) -> np.ndarray:
        dt = self.dt
        return np.array([
            [dt ** 4 / 4, 0.0, dt ** 3 / 2, 0.0],
            [0.0, dt ** 4 / 4, 0.0, dt ** 3 / 2],
            [dt ** 3 / 2, 0.0, dt ** 2, 0.0],
            [0.0, dt ** 3 / 2, 0.0, dt ** 2],
        ], dtype=np.float64) * q_var

    def initialize_state(self, initial_pos: np.ndarray, residual_rms: float = 0.0, max_init_rms: float = 500.0) -> bool:
        """
        Validate and initialize state vector with first Stage 1 fix.
        Rejects bad initial frames if initial residual RMS is excessively high.
        """
        if residual_rms > max_init_rms:
            return False

        self.x[0, 0] = initial_pos[0]
        self.x[1, 0] = initial_pos[1]
        self.x[2, 0] = 0.0  # initial vx
        self.x[3, 0] = 0.0  # initial vy
        self._initialized = True
        return True

    def update(self, z_trilat: np.ndarray, residual_rms: float = 0.0, gdop: float = 1.0, measurement_uncertainty: float = 25.0) -> dict:
        """
        Execute Kalman Prediction and Update steps with Adaptive Q and Adaptive R scaling.

        :param measurement_uncertainty: 1-sigma measurement uncertainty in meters (from TA band).
                                         Scales the measurement noise R matrix.
        """
        z_trilat = np.asarray(z_trilat, dtype=np.float64).reshape(2, 1)

        if not self._initialized:
            success = self.initialize_state(z_trilat.flatten(), residual_rms=residual_rms)
            if not success:
                return {
                    "position": z_trilat.flatten(),
                    "velocity": np.zeros(2, dtype=np.float64),
                    "covariance": self.P[:2, :2],
                    "adaptive_R_scale": 1.0,
                    "initialized": False,
                }

        if self._first_update:
            self._first_update = False
            q_scale = 1.0
            Q_k = self._get_process_noise_Q(self.base_q_var)
        else:
            # 1. Compute Innovation Residual y to detect abrupt maneuvers
            predicted_pos = (self.F @ self.x)[:2]
            innovation_norm = np.linalg.norm(z_trilat - predicted_pos)

            # Adaptive Process Noise Q_k (scale up Q if suspect makes sudden sharp turn/maneuver)
            q_scale = max(1.0, (innovation_norm / 50.0) ** 2)
            Q_k = self._get_process_noise_Q(self.base_q_var * q_scale)

            # 2. Predict Step
            self.x = self.F @ self.x
            self.P = self.F @ self.P @ self.F.T + Q_k

        # 3. Compute uncertainty-scaled + GDOP + Residual Adaptive R Matrix
        uncertainty_factor = max(0.1, measurement_uncertainty / max(self.base_measurement_std, 1.0))
        gdop_factor = max(1.0, gdop ** 2)
        residual_factor = 1.0 + (residual_rms / max(self.base_measurement_std, 1.0)) ** 2
        total_r_scale = uncertainty_factor * gdop_factor * residual_factor

        R_k = self.R_base * total_r_scale

        # 4. Measurement Update Step with Mahalanobis gating
        y = z_trilat - (self.H @ self.x)
        S = self.H @ self.P @ self.H.T + R_k

        # Mahalanobis distance gating: reject outlier measurements (chi2, 2 DOF, 99%)
        from scipy.stats import chi2 as _chi2
        mahal_sq = (y.T @ np.linalg.inv(S) @ y).item()
        if mahal_sq > _chi2.ppf(0.99, 2):
            return {
                "position": np.array([self.x[0, 0], self.x[1, 0]]),
                "velocity": np.array([self.x[2, 0], self.x[3, 0]]),
                "covariance": self.P[:2, :2],
                "adaptive_R_scale": total_r_scale,
                "initialized": True,
                "rejected": True,
            }

        K = self.P @ self.H.T @ np.linalg.inv(S)

        self.x = self.x + (K @ y)
        I = np.eye(4, dtype=np.float64)
        self.P = (I - K @ self.H) @ self.P @ (I - K @ self.H).T + K @ R_k @ K.T

        pos_x, pos_y, vel_x, vel_y = self.x.flatten()
        spatial_cov = self.P[:2, :2]

        return {
            "position": np.array([pos_x, pos_y]),
            "velocity": np.array([vel_x, vel_y]),
            "covariance": spatial_cov,
            "adaptive_R_scale": total_r_scale,
            "adaptive_Q_scale": q_scale,
            "initialized": True,
        }


if __name__ == "__main__":
    kf = KalmanTracker(dt=1.0, target_type="pedestrian")
    measurements = np.array([[0.0, 0.0], [1.1, 0.0], [1.9, 0.1], [3.0, 0.0], [4.1, 0.0]])
    errors = []
    for z in measurements:
        res = kf.update(z.reshape(2, 1), residual_rms=10.0, gdop=1.5)
        if res["initialized"]:
            err = np.linalg.norm(res["position"] - z)
            errors.append(err)
    assert len(errors) == 5
    assert np.mean(errors) < 1.0, f"Kalman tracking error too large: {np.mean(errors):.4f}m"
    print(f"kalman_filter.py self-test OK (mean_error={np.mean(errors):.4f}m)")
